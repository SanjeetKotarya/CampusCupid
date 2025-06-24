import React, { useEffect, useRef, useState } from 'react';

// Audio level meter component
const AudioLevelMeter = ({ stream }) => {
  const [level, setLevel] = useState(0);
  const animationFrameRef = useRef();
  const analyserRef = useRef();
  const dataArrayRef = useRef();

  useEffect(() => {
    // Check if stream is valid and has audio tracks
    if (!stream || typeof stream.getAudioTracks !== 'function' || stream.getAudioTracks().length === 0) return;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    let source;
    try {
      source = audioContext.createMediaStreamSource(stream);
    } catch (err) {
      console.warn('AudioLevelMeter: failed to createMediaStreamSource:', err);
      return;
    }

    const analyser = audioContext.createAnalyser();
    analyserRef.current = analyser;

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    dataArrayRef.current = dataArray;

    source.connect(analyser);

    const updateLevel = () => {
      if (!analyserRef.current || !dataArrayRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      const average = dataArrayRef.current.reduce((a, b) => a + b, 0) / dataArrayRef.current.length;
      setLevel(average / 255); // Normalize to 0-1
      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      audioContext.close();
    };
  }, [stream]);

  return (
    <div style={{
      width: '200px',
      height: '20px',
      background: '#ffe0ec',
      borderRadius: '10px',
      overflow: 'hidden',
      margin: '10px 0'
    }}>
      <div style={{
        width: `${level * 100}%`,
        height: '100%',
        background: '#ff4081',
        transition: 'width 0.1s ease'
      }} />
    </div>
  );
};

const servers = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

function AudioCallWindow({
  callId,
  isCaller,
  onEnd,
  signalingSend,
  signalingListen,
  remoteUserName = 'Remote User',
  pendingOffer,
}) {
  const [callActive, setCallActive] = useState(false);
  const [error, setError] = useState('');
  const [fatalError, setFatalError] = useState(false);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const pcRef = useRef(null);
  const cleanupRef = useRef([]);
  const [answerSent, setAnswerSent] = useState(false);
  const iceCandidateQueue = useRef([]);
  const remoteDescSet = useRef(false);
  const [offerSent, setOfferSent] = useState(false);

  const addQueuedIceCandidates = async () => {
    if (remoteDescSet.current && pcRef.current && iceCandidateQueue.current.length > 0) {
      for (const candidate of iceCandidateQueue.current) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('AudioCallWindow: Failed to add queued ICE candidate', err);
        }
      }
      iceCandidateQueue.current = [];
    }
  };

  useEffect(() => {
    let unsub = null;
    let pc = new window.RTCPeerConnection(servers);
    pcRef.current = pc;
    let localStream;
    let remoteStream = new window.MediaStream();
    remoteStreamRef.current = remoteStream;
    let cancelled = false;

    async function start() {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled || !pcRef.current || pcRef.current.signalingState === 'closed') {
          setError('Call was cancelled or connection closed before microphone could be accessed.');
          setFatalError(true);
          return;
        }
        localStreamRef.current = localStream;
        localStream.getTracks().forEach(track => {
          if (pcRef.current && pcRef.current.signalingState !== 'closed') {
            pcRef.current.addTrack(track, localStream);
          } else {
            setError("Could not add audio track: connection is closed.");
            setFatalError(true);
          }
        });
        setCallActive(true);
      } catch (err) {
        setError('Could not access microphone: ' + err.message);
        setFatalError(true);
        console.error('AudioCallWindow: getUserMedia error', err);
        return;
      }

      pc.ontrack = (event) => {
        console.log('[AudioCallWindow] ontrack fired. event.streams:', event.streams);
        event.streams[0].getAudioTracks().forEach(track => {
          remoteStream.addTrack(track);
          console.log('[AudioCallWindow] Added remote audio track:', track);
        });
        const audioElem = document.getElementById('remoteAudio');
        if (audioElem) {
          audioElem.srcObject = remoteStream;
          audioElem.muted = false;
          audioElem.volume = 1.0;
          console.log('[AudioCallWindow] Set remoteAudio.srcObject:', remoteStream);
        } else {
          console.warn('[AudioCallWindow] remoteAudio element not found');
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[AudioCallWindow] ICE connection state changed:', pc.iceConnectionState);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('[AudioCallWindow] Sending ICE candidate:', event.candidate);
          signalingSend({ type: 'ice', candidate: event.candidate.toJSON() });
        }
      };

      if (isCaller && !offerSent) {
        try {
          const offer = await pc.createOffer();
          console.log('[AudioCallWindow] Caller: Created offer', offer);
          if (cancelled || !pcRef.current || pcRef.current.signalingState === 'closed') return;
          console.log('[AudioCallWindow] Caller: Before setLocalDescription(offer), signalingState:', pc.signalingState);
          await pc.setLocalDescription(offer);
          console.log('[AudioCallWindow] Caller: After setLocalDescription(offer), signalingState:', pc.signalingState);
          signalingSend({ type: 'offer', offer: { sdp: offer.sdp, type: offer.type } });
          setOfferSent(true);
        } catch (err) {
          setError('Failed to create/send offer: ' + err.message);
          setFatalError(true);
        }
      }
    }

    start();

    cleanupRef.current.push(() => {
      cancelled = true;
      if (unsub) unsub();
      if (pc) pc.close();
      if (localStream) localStream.getTracks().forEach(track => track.stop());
      pcRef.current = null;
      localStreamRef.current = null;
      remoteStreamRef.current = null;
    });

    return () => {
      cleanupRef.current.forEach(fn => fn());
    };
  }, [isCaller, offerSent]);

  useEffect(() => {
    async function handleOffer() {
      if (!isCaller) {
        if (!pendingOffer) {
          console.warn('[AudioCallWindow] Callee: No pendingOffer yet');
          return;
        }
        if (!pendingOffer.sdp) {
          console.warn('[AudioCallWindow] Callee: pendingOffer has no SDP yet, waiting...');
          return;
        }
        if (pcRef.current && !answerSent) {
          try {
            console.log('[AudioCallWindow] Callee: Before setRemoteDescription(offer), signalingState:', pcRef.current.signalingState);
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(pendingOffer));
            console.log('[AudioCallWindow] Callee: After setRemoteDescription(offer), signalingState:', pcRef.current.signalingState);
            remoteDescSet.current = true;
            await addQueuedIceCandidates();
            const answer = await pcRef.current.createAnswer();
            console.log('[AudioCallWindow] Callee: Created answer', answer);
            console.log('[AudioCallWindow] Callee: Before setLocalDescription(answer), signalingState:', pcRef.current.signalingState);
            await pcRef.current.setLocalDescription(answer);
            console.log('[AudioCallWindow] Callee: After setLocalDescription(answer), signalingState:', pcRef.current.signalingState);
            signalingSend({ type: 'answer', answer: { sdp: answer.sdp, type: answer.type } });
            setAnswerSent(true);
            console.log('[AudioCallWindow] Callee: Sent answer SDP');
          } catch (err) {
            setError('Failed to accept call: ' + err.message);
            setFatalError(true);
            console.error('[AudioCallWindow] Callee: Error setting remote offer/creating answer', err);
          }
        }
      }
    }
    handleOffer();
  }, [pendingOffer, isCaller, answerSent]);

  useEffect(() => {
    let unsub = signalingListen(async (msg) => {
      if (!msg) return;
      console.log('[AudioCallWindow] Received signaling message:', msg);
      try {
        if (msg.type === 'answer' && isCaller) {
          const pc = pcRef.current;
          console.log('[AudioCallWindow] Received answer. Current signalingState:', pc?.signalingState);
          if (pc && pc.signalingState === 'have-local-offer') {
            console.log('[AudioCallWindow] Caller: Before setRemoteDescription(answer), signalingState:', pc.signalingState);
            await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
            console.log('[AudioCallWindow] Caller: After setRemoteDescription(answer), signalingState:', pc.signalingState);
            remoteDescSet.current = true;
            await addQueuedIceCandidates();
            console.log('[AudioCallWindow] setRemoteDescription(answer) success. New signalingState:', pc.signalingState);
          } else {
            console.warn('[AudioCallWindow] Skipped setRemoteDescription(answer) because signalingState is', pc?.signalingState);
          }
        } else if (msg.type === 'ice') {
          if (!remoteDescSet.current) {
            iceCandidateQueue.current.push(msg.candidate);
          } else {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
          }
        } else if (msg.type === 'end') {
          setError('Call ended by remote user.');
          setFatalError(true);
        } else if (msg.type === 'declined') {
          setError('Call was declined.');
          setFatalError(true);
        }
      } catch (err) {
        setError('Signaling error: ' + err.message);
        setFatalError(true);
      }
    });
    return () => { if (unsub) unsub(); };
  }, [isCaller]);

  const handleEnd = () => {
    signalingSend({ type: 'end' });
    onEnd();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: '#fff',
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0,
    }}>
      <div style={{ fontSize: 22, color: '#ff4081', fontWeight: 700, marginBottom: 18 }}>
        {error ? error : callActive ? `Audio Call with ${remoteUserName}` : 'Connecting...'}
      </div>
      <audio id="remoteAudio" autoPlay style={{ width: 0, height: 0 }} />

      <div style={{ marginBottom: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#888', marginBottom: 5 }}>Your Audio Level:</div>
        {localStreamRef.current && localStreamRef.current.getAudioTracks().length > 0 && (
          <AudioLevelMeter stream={localStreamRef.current} />
        )}
        <div style={{ fontSize: 14, color: '#888', marginTop: 10, marginBottom: 5 }}>Remote Audio Level:</div>
        {remoteStreamRef.current && remoteStreamRef.current.getAudioTracks().length > 0 && (
          <AudioLevelMeter stream={remoteStreamRef.current} />
        )}
      </div>

      <button
        onClick={handleEnd}
        style={{
          background: '#ff4081',
          color: '#fff',
          border: 'none',
          borderRadius: 18,
          padding: '14px 38px',
          fontWeight: 700,
          fontSize: 20,
          marginTop: 32,
          cursor: 'pointer',
        }}
      >
        End Call
      </button>
      {fatalError && (
        <button
          onClick={onEnd}
          style={{
            background: '#ffe0ec',
            color: '#ff4081',
            border: 'none',
            borderRadius: 18,
            padding: '10px 28px',
            fontWeight: 600,
            fontSize: 16,
            marginTop: 18,
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      )}
    </div>
  );
}

export default AudioCallWindow;
