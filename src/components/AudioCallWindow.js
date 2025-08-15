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
    // Use only STUN for direct P2P on local network. TURN is removed.
    { urls: 'stun:stun.l.google.com:19302' }
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

// --- LOGGING WRAPPER FOR SIGNALING SEND ---
function logSignalingSend(msg, context) {
  console.log('[AudioCallWindow] signalingSend:', context, msg);
}

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
  const [answerSet, setAnswerSet] = useState(false);
  const pendingAnswerRef = useRef(null);
  const pendingIceCandidatesRef = useRef([]);
  const [callReallyEnded, setCallReallyEnded] = useState(false);
  // Add a ref to prevent double onEnd
  const onEndCalledRef = useRef(false);
  // Robust onEnd wrapper
  const safeOnEnd = (reason, fatal = false, userEnded = false) => {
    if (onEndCalledRef.current) {
      console.warn('[AudioCallWindow] safeOnEnd: already called, skipping. Reason:', reason);
      return;
    }
    onEndCalledRef.current = true;
    console.log('[AudioCallWindow] safeOnEnd called. Reason:', reason, 'fatal:', fatal, 'userEnded:', userEnded, new Error().stack);
    onEnd(fatal, userEnded);
  };

  const addQueuedIceCandidates = async () => {
    if (remoteDescSet.current && pcRef.current && iceCandidateQueue.current.length > 0) {
      console.log('[AudioCallWindow] Flushing queued ICE candidates:', iceCandidateQueue.current.length);
      for (const candidate of iceCandidateQueue.current) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('[AudioCallWindow] addQueuedIceCandidates: addIceCandidate success', candidate);
        } catch (err) {
          console.error('[AudioCallWindow] addQueuedIceCandidates: Failed to add ICE candidate', err, candidate);
        }
      }
      iceCandidateQueue.current = [];
    }
  };

  // Wrap signalingSend with logging
  const signalingSendLogged = (msg, context = '') => {
    logSignalingSend(msg, context);
    return signalingSend(msg);
  };

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [remoteStreamActive, setRemoteStreamActive] = useState(false);

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
          audio: true,
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
        });
        console.log('[AudioCallWindow] getUserMedia success, localStream tracks:', localStream.getTracks());
        if (cancelled || !pcRef.current || pcRef.current.signalingState === 'closed') {
          setError('Call was cancelled or connection closed before camera/mic could be accessed.');
          setFatalError(true);
          safeOnEnd('getUserMedia cancelled or connection closed', true, false);
          return;
        }
        localStreamRef.current = localStream;
        // Attach local stream to local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }
        localStream.getTracks().forEach(track => {
          if (pcRef.current && pcRef.current.signalingState !== 'closed') {
            pcRef.current.addTrack(track, localStream);
            console.log('[AudioCallWindow] addTrack called for', track);
          } else {
            setError("Could not add media track: connection is closed.");
            setFatalError(true);
            safeOnEnd('addTrack: connection closed', true, false);
          }
        });
        setCallActive(true);
      } catch (err) {
        setError('Could not access camera/microphone: ' + err.message);
        setFatalError(true);
        console.error('AudioCallWindow: getUserMedia error', err);
        safeOnEnd('getUserMedia error: ' + err.message, true, false);
        return;
      }

      pc.ontrack = (event) => {
        console.log('[AudioCallWindow] ontrack fired. event.streams:', event.streams);
        event.streams[0].getTracks().forEach(track => {
          remoteStream.addTrack(track);
          console.log('[AudioCallWindow] Added remote media track:', track);
        });
        // Attach remote stream to remote video
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          // If the remote stream has a video track, set remoteStreamActive true
          if (remoteStream.getVideoTracks().length > 0) {
            setRemoteStreamActive(true);
          }
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
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          console.log('[AudioCallWindow] ICE connection established successfully');
        } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          console.log('[AudioCallWindow] ICE connection failed or disconnected');
          setError('Connection lost. Please try again.');
          setFatalError(true);
          safeOnEnd('ICE connection failed or disconnected', true, false);
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('[AudioCallWindow] Connection state changed:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          console.log('[AudioCallWindow] Peer connection established');
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          console.log('[AudioCallWindow] Peer connection failed or disconnected');
          setError('Connection lost. Please try again.');
          setFatalError(true);
          safeOnEnd('Peer connection failed or disconnected', true, false);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('[AudioCallWindow] Sending ICE candidate:', event.candidate);
          signalingSendLogged({ type: 'ice', candidate: event.candidate.toJSON() }, isCaller ? 'caller-ice' : 'callee-ice');
        }
      };

      if (isCaller && !offerSent && pcRef.current) {
        (async () => {
          try {
            const pc = pcRef.current;
            const offer = await pc.createOffer();
            console.log('[AudioCallWindow] Caller: About to call setLocalDescription(offer). signalingState:', pc.signalingState);
            await pc.setLocalDescription(offer);
            console.log('[AudioCallWindow] Caller: setLocalDescription(offer) success. signalingState:', pc.signalingState);
            signalingSendLogged({ type: 'offer', offer: { sdp: offer.sdp, type: offer.type } }, 'caller-offer');
            setOfferSent(true);
          } catch (err) {
            setError('Failed to create/send offer: ' + err.message);
            setFatalError(true);
          }
        })();
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
      // Do NOT call onEnd here; only call onEnd via safeOnEnd for true call end events
      console.log('[AudioCallWindow] Cleanup on unmount. onEndCalledRef:', onEndCalledRef.current);
    };
  }, [isCaller, offerSent]);

  useEffect(() => {
    async function handleOffer() {
      if (!isCaller && pendingOffer && pendingOffer.callerId && pcRef.current && !answerSent) {
        // Wait for the actual SDP offer to be sent by the caller
        // The initial pendingOffer only contains callerId, not SDP
        console.log('[AudioCallWindow] Callee: Waiting for SDP offer from caller...');
      }
    }
    handleOffer();
  }, [pendingOffer, isCaller, answerSent]);

  useEffect(() => {
    let unsub = signalingListen(async (msg) => {
      if (!msg) return;
      console.log('[AudioCallWindow] signalingListen received FULL MSG:', msg);
      const pc = pcRef.current;
      // Robust answer extraction
      const answer = msg.answer || (msg.data && msg.data.answer);
      if (answer && isCaller && !answerSet) {
        if (pc) {
          if (pc.signalingState === 'have-local-offer' && !pc.remoteDescription) {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(answer));
              setAnswerSet(true);
              // Flush queued ICE candidates
              for (const cand of pendingIceCandidatesRef.current) {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              }
              pendingIceCandidatesRef.current = [];
            } catch (err) {
              console.error('[AudioCallWindow] setRemoteDescription(answer) error:', err);
            }
          } else {
            // Queue the answer
            pendingAnswerRef.current = answer;
          }
        }
      }
      // ICE candidate handling
      if (msg.type === 'ice' && msg.candidate) {
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (err) {
            console.error('[AudioCallWindow] addIceCandidate error:', err);
          }
        } else {
          pendingIceCandidatesRef.current.push(msg.candidate);
        }
      }
      // Callee: handle offer
      if (msg.type === 'offer' && !isCaller && msg.offer && msg.offer.sdp) {
        if (pc && pc.signalingState === 'stable') {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
            const answerObj = await pc.createAnswer();
            await pc.setLocalDescription(answerObj);
            signalingSendLogged({ type: 'answer', answer: { sdp: answerObj.sdp, type: answerObj.type } }, 'callee-answer');
          } catch (err) {
            console.error('[AudioCallWindow] Callee: setRemoteDescription(offer) or setLocalDescription(answer) error:', err);
          }
        }
      } else if (msg.type === 'end') {
        setError('Call ended by remote user.');
        setFatalError(true);
        safeOnEnd('signaling: remote user ended call', true, false);
      } else if (msg.type === 'declined') {
        setError('Call was declined.');
        setFatalError(true);
        safeOnEnd('signaling: call declined', true, false);
      }
    });
    return () => { if (unsub) unsub(); };
  }, [isCaller]);

  // On signalingState change, set pending answer if needed
  useEffect(() => {
    const pc = pcRef.current;
    if (!pc) return;
    const handler = async () => {
      if (
        isCaller &&
        !answerSet &&
        pendingAnswerRef.current &&
        (pc.signalingState === 'have-local-offer' || pc.signalingState === 'stable')
      ) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(pendingAnswerRef.current));
          setAnswerSet(true);
          // Flush queued ICE candidates
          for (const cand of pendingIceCandidatesRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          }
          pendingIceCandidatesRef.current = [];
          pendingAnswerRef.current = null;
          console.log('[AudioCallWindow] Caller: setRemoteDescription(answer) success (from pending, forced if stable). New signalingState:', pc.signalingState);
        } catch (err) {
          console.error('[AudioCallWindow] setRemoteDescription(answer) from pending error:', err);
          // Reset peer connection and notify user
          setError('Call could not be established. Please try again. [Sync error]');
          setFatalError(true);
        }
      }
    };
    pc.addEventListener('signalingstatechange', handler);
    // Also call handler immediately in case the answer is already queued and state is stable
    handler();
    return () => pc.removeEventListener('signalingstatechange', handler);
  }, [isCaller, answerSet]);

  const handleEnd = () => {
    setCallReallyEnded(true);
    signalingSendLogged({ type: 'end' }, 'caller-end');
    setTimeout(() => {
      safeOnEnd('user ended call', true, true);
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
      // Only call safeOnEnd if not already called
      setTimeout(() => {
        safeOnEnd('fatalError effect', true, false);
      }, 2000);
    }
  }, [fatalError]);

  // Attach local/remote streams to video elements on mount/update
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [callActive]);

  // Reset all state/refs and peer connection when callId changes
  useEffect(() => {
    if (!callReallyEnded) return;
    setAnswerSet(false);
    pendingAnswerRef.current = null;
    pendingIceCandidatesRef.current = [];
    if (pcRef.current) {
      try { pcRef.current.close(); } catch (e) {}
      pcRef.current = null;
    }
  }, [callReallyEnded]);

  // UI label logic
  let callStatusLabel = '';
  if (!remoteStreamActive) {
    if (isCaller) {
      callStatusLabel = `Calling ${remoteUserName || 'Remote User'}...`;
    } else {
      callStatusLabel = `Connecting to ${remoteUserName || 'Remote User'}...`;
    }
  } else {
    callStatusLabel = `In call with ${remoteUserName || 'Remote User'}`;
  }

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
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: 0,
      }}>
        {/* Overlay: Call Status Label, Timer, Error */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 18, color: '#ff4081', fontWeight: 700, marginTop: 18, marginBottom: 6, letterSpacing: 1, textShadow: '0 2px 8px #fff8' }}>
            {callStatusLabel}
          </div>
          <div style={{ color: '#888', fontSize: 16, marginBottom: 8, letterSpacing: 2, textShadow: '0 2px 8px #fff8' }}>
            {error ? error : !callStarted ? (isCaller ? 'Ringing...' : 'Connecting...') : formatTime(callTime)}
          </div>
        </div>
        {/* Videos stacked: remote (top), local (bottom) */}
        <div style={{ width: '100%', height: '50%', position: 'relative', background: '#222', borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{
              width: '100%',
              height: '100%',
              background: 'transparent',
              objectFit: 'cover',
              display: remoteStreamActive ? 'block' : 'none',
            }}
          />
          {!remoteStreamActive && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
              <div className="video-spinner" style={{ width: 48, height: 48, border: '5px solid #ffe0ec', borderTop: '5px solid #ff4081', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            </div>
          )}
        </div>
        <div style={{ width: '100%', height: '50%', position: 'relative', background: '#222', borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '2px solid #ffe0ec' }}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              background: '#444',
              transform: 'scaleX(-1)', // mirror local video
            }}
          />
        </div>
        {/* Overlay: End Call Button */}
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 36,
          zIndex: 20,
          display: 'flex',
          justifyContent: 'center',
          pointerEvents: 'auto',
        }}>
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
      </div>
    </div>
  );
}

export default AudioCallWindow;
