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
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

// Add a global audioContext ref for resumeAudioContext
let globalAudioContext = null;

// Add resumeAudioContext function
const resumeAudioContext = async () => {
  if (!globalAudioContext) {
    globalAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (globalAudioContext.state === 'suspended') {
    await globalAudioContext.resume();
    console.log('[AudioCallWindow] AudioContext resumed');
  }
};

function AudioCallWindow({
  callId,
  isCaller,
  onEnd,
  signalingSend,
  signalingListen,
  remoteUserName = 'Remote User',
  remoteUserPhotoURL,
  pendingOffer,
}) {
  console.log('[AudioCallWindow] remoteUserPhotoURL:', remoteUserPhotoURL);
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
  const [callStarted, setCallStarted] = useState(false);
  const [callTime, setCallTime] = useState(0);
  const [ringTimeout, setRingTimeout] = useState(false);
  const timerRef = useRef(null);
  const ringTimeoutRef = useRef(null);
  const [ringCountdown, setRingCountdown] = useState(10);

  const addQueuedIceCandidates = async () => {
    if (remoteDescSet.current && pcRef.current && iceCandidateQueue.current.length > 0) {
      console.log('[AudioCallWindow] Adding all queued ICE candidates:', iceCandidateQueue.current.length);
      for (const candidate of iceCandidateQueue.current) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('[AudioCallWindow] addQueuedIceCandidates: addIceCandidate success', candidate);
        } catch (err) {
          console.error('[AudioCallWindow] addQueuedIceCandidates: Failed to add ICE candidate', err, candidate);
        }
      }
      iceCandidateQueue.current = [];
    } else {
      if (!remoteDescSet.current) console.log('[AudioCallWindow] addQueuedIceCandidates: remoteDescSet not set yet');
      if (!pcRef.current) console.log('[AudioCallWindow] addQueuedIceCandidates: pcRef not set yet');
      if (iceCandidateQueue.current.length === 0) console.log('[AudioCallWindow] addQueuedIceCandidates: No candidates to add');
    }
  };

  useEffect(() => {
    let unsub = null;
    let pc = new window.RTCPeerConnection(servers);
    console.log('[AudioCallWindow] PeerConnection created:', pc);
    console.log('[AudioCallWindow] Initial ICE state:', pc.iceConnectionState);
    pcRef.current = pc;
    let localStream;
    let remoteStream = new window.MediaStream();
    remoteStreamRef.current = remoteStream;
    let cancelled = false;

    async function start() {
      try {
        await resumeAudioContext();
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        console.log('[AudioCallWindow] getUserMedia success, localStream tracks:', localStream.getTracks());
        if (cancelled || !pcRef.current || pcRef.current.signalingState === 'closed') {
          setError('Call was cancelled or connection closed before microphone could be accessed.');
          setFatalError(true);
          return;
        }
        localStreamRef.current = localStream;
        localStream.getTracks().forEach(track => {
          if (pcRef.current && pcRef.current.signalingState !== 'closed') {
            pcRef.current.addTrack(track, localStream);
            console.log('[AudioCallWindow] addTrack called for', track);
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
          audioElem.play().catch(() => {});
          console.log('[AudioCallWindow] Set remoteAudio.srcObject and called play()', remoteStream);
        } else {
          console.warn('[AudioCallWindow] remoteAudio element not found');
        }
        if (!callStarted) {
          setCallStarted(true);
          setCallTime(0);
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = setInterval(() => {
            setCallTime(t => t + 1);
          }, 1000);
          if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
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

    // Add a timeout for ringing (20s)
    ringTimeoutRef.current = setTimeout(() => {
      if (!callStarted) {
        setRingTimeout(true);
        setError('Call could not be established. Please try again.');
        setFatalError(true);
      }
    }, 20000);

    cleanupRef.current.push(() => {
      cancelled = true;
      if (unsub) unsub();
      if (pc) pc.close();
      if (localStream) localStream.getTracks().forEach(track => track.stop());
      pcRef.current = null;
      localStreamRef.current = null;
      remoteStreamRef.current = null;
      if (timerRef.current) clearInterval(timerRef.current);
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    });

    return () => {
      cleanupRef.current.forEach(fn => fn());
    };
  }, [isCaller, offerSent]);

  useEffect(() => {
    async function handleOffer() {
      if (!isCaller && pendingOffer && pendingOffer.sdp && pcRef.current && !answerSent) {
        try {
          console.log('[AudioCallWindow] Callee: Setting remote offer SDP');
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(pendingOffer));
          remoteDescSet.current = true;
          console.log('[AudioCallWindow] Callee: remoteDescSet set to true, calling addQueuedIceCandidates');
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
          console.log('[AudioCallWindow] Received ICE candidate:', msg.candidate);
          if (!remoteDescSet.current) {
            iceCandidateQueue.current.push(msg.candidate);
            console.log('[AudioCallWindow] Queued ICE candidate (remote description not set yet)');
          } else {
            console.log('[AudioCallWindow] Adding ICE candidate to peer connection');
            await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
            console.log('[AudioCallWindow] addIceCandidate success');
          }
        } else if (msg.type === 'end') {
          setError('Call ended by remote user.');
          setFatalError(true);
          onEnd();
        } else if (msg.type === 'declined') {
          setError('Call was declined.');
          setFatalError(true);
        }
      } catch (err) {
        setError('Signaling error: ' + err.message);
        setFatalError(true);
        console.error('[AudioCallWindow] Error in signaling handler:', err);
      }
    });
    return () => { if (unsub) unsub(); };
  }, [isCaller]);

  const handleEnd = () => {
    signalingSend({ type: 'end' });
    // Wait a short delay before closing to allow the remote peer to process the 'end' message
    setTimeout(() => {
      onEnd();
    }, 400);
  };

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Format call time as mm:ss
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Automatically close the call window 2 seconds after a fatal error
  useEffect(() => {
    if (fatalError) {
      const timeout = setTimeout(() => {
        onEnd();
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [fatalError, onEnd]);

  // Countdown for auto-end (caller side)
  useEffect(() => {
    let interval;
    if (isCaller && !callStarted && !fatalError) {
      setRingCountdown(10);
      interval = setInterval(() => {
        setRingCountdown(prev => {
          if (prev > 1) return prev - 1;
          // When countdown reaches 1, next tick will be 0, so end call
          if (prev === 1) {
            setTimeout(() => handleEnd(), 0);
          }
          return 0;
        });
      }, 1000);
    }
    // Clear interval if call is answered, fatal error, or component unmounts
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCaller, callStarted, fatalError]);

  // Hide countdown as soon as call is answered
  useEffect(() => {
    if (callStarted) {
      setRingCountdown(0);
    }
  }, [callStarted]);

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'none',
    }}>
      <div style={{
        width: '100%',
        height: '100%',
        maxWidth: 430,
        margin: '0 auto',
        background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
        borderRadius: 32,
        boxShadow: '0 8px 48px #ff408122',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        padding: 0,
        justifyContent: 'flex-start',
      }}>
        {/* Profile Picture */}
        <img
          key={remoteUserPhotoURL || 'fallback'}
          src={remoteUserPhotoURL ? remoteUserPhotoURL : 'https://api.dicebear.com/7.x/person/svg?seed=CampusCupid'}
          alt={remoteUserName || 'User'}
          style={{
            width: 96,
            height: 96,
            borderRadius: '50%',
            objectFit: 'cover',
            marginTop: 48,
            marginBottom: 28,
            border: '4px solid #fff',
            boxShadow: '0 2px 16px #ff408122',
            background: '#f8f8f8', // fallback background
            display: 'block'
          }}
          onError={e => { e.target.onerror = null; e.target.src = 'https://api.dicebear.com/7.x/person/svg?seed=CampusCupid'; }}
        />
        {/* Remote User Name */}
        <div style={{ fontSize: 28, color: '#ff4081', fontWeight: 700, marginBottom: 12 }}>
          {remoteUserName || 'Remote User'}
        </div>
        {/* Call Status/Timer */}
        <div style={{ color: '#888', fontSize: 18, marginBottom: 32, letterSpacing: 2 }}>
          {error ? error : !callStarted ? 'Ringing...' : formatTime(callTime)}
        </div>
        {/* Countdown Timer (only for caller, only while ringing) */}
        {isCaller && !callStarted && !fatalError && (
          <>
            <div style={{ fontSize: 40, color: '#ff4081', fontWeight: 700, textAlign: 'center', margin: '0 0 8px 0' }}>
              {ringCountdown}
            </div>
            <div style={{ fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 40 }}>
              Audio calling doesn&apos;t work yet. This feature is coming soon.
            </div>
          </>
        )}
        {/* End Call Button at the bottom */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 48, display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={handleEnd}
            style={{
              background: 'linear-gradient(135deg, #ff5858 0%, #f857a6 100%)',
              border: 'none',
              borderRadius: '50%',
              width: 64,
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 12px #ff585844',
              cursor: 'pointer',
              marginLeft: 0,
            }}
            title="End Call"
          >
            <span role="img" aria-label="end call" style={{ fontSize: 32, color: '#fff', transform: 'rotate(135deg)' }}>📞</span>
          </button>
        </div>
        <audio id="remoteAudio" autoPlay playsInline style={{ width: 0, height: 0 }} />
      </div>
    </div>
  );
}

export default AudioCallWindow;
