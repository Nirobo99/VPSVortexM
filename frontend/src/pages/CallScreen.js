import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Room, RemoteTrack, LocalTrack, TrackEvent } from 'livekit-client';
import { 
  shouldAnonymize, 
  applyVideoBlur, 
  removeVideoBlur, 
  getAnonymousDisplayName,
  getAnonymousAvatar,
  createAnonymousParticipantInfo,
  DEFAULT_ANONYMIZATION_OPTIONS
} from '../utils/anonymizer';
import './CallScreen.css';

const CallScreen = ({ socket }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const videoGridRef = useRef(null);
  const localVideoRef = useRef(null);
  
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callInfo, setCallInfo] = useState(null);
  const [duration, setDuration] = useState(0);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [error, setError] = useState(null);

  // Get call data from navigation state or props
  const callData = location.state?.call || location.state?.incomingCall;

  useEffect(() => {
    if (callData) {
      setCallInfo(callData);
      connectToRoom(callData);
    }

    return () => {
      if (room) {
        room.disconnect();
      }
    };
  }, [callData]);

  useEffect(() => {
    if (socket) {
      socket.on('call_ended', handleCallEnded);
      socket.on('call_participant_disconnected', handleParticipantDisconnected);
      socket.on('participant_state_changed', handleParticipantStateChanged);

      return () => {
        socket.off('call_ended');
        socket.off('call_participant_disconnected');
        socket.off('participant_state_changed');
      };
    }
  }, [socket]);

  useEffect(() => {
    const timer = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const connectToRoom = async (callData) => {
    try {
      const livekitUrl = callData.livekitUrl || 'ws://localhost:7880';
      const token = callData.token;
      const roomName = callData.roomName;

      if (!token) {
        throw new Error('No token provided');
      }

      const newRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
          resolution: { width: 1280, height: 720 },
          frameRate: 30,
        },
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Set up event listeners
      newRoom.on(RoomEvent.Connected, () => {
        console.log('Connected to room');
        setIsConnected(true);
        updateParticipants(newRoom);
      });

      newRoom.on(RoomEvent.ParticipantConnected, () => {
        updateParticipants(newRoom);
      });

      newRoom.on(RoomEvent.ParticipantDisconnected, () => {
        updateParticipants(newRoom);
      });

      newRoom.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      newRoom.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);

      newRoom.on(RoomEvent.Disconnected, () => {
        console.log('Disconnected from room');
        setIsConnected(false);
        handleEndCall();
      });

      // Connect to room
      await newRoom.connect(livekitUrl, token);
      setRoom(newRoom);

      // Enable camera and microphone
      await newRoom.localParticipant.setCameraEnabled(true);
      await newRoom.localParticipant.setMicrophoneEnabled(true);

    } catch (error) {
      console.error('Error connecting to room:', error);
      setError('Failed to connect to call. Please try again.');
    }
  };

  const updateParticipants = (currentRoom) => {
    if (!currentRoom) return;
    
    const participantsList = Array.from(currentRoom.remoteParticipants.values());
    setParticipants(participantsList);
  };

  const handleTrackSubscribed = (track, publication, participant) => {
    if (track.kind === Track.Kind.Video) {
      const videoElement = document.createElement('video');
      videoElement.id = `video-${participant.identity}`;
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      track.attach(videoElement);
      
      // Apply anonymization if participant is anonymous
      const participantInfo = createAnonymousParticipantInfo({
        ...participant,
        anonymous: participant.metadata?.anonymous || false
      });
      
      if (participantInfo.isAnonymous) {
        applyVideoBlur(videoElement, DEFAULT_ANONYMIZATION_OPTIONS.video);
      }
      
      if (videoGridRef.current) {
        videoGridRef.current.appendChild(videoElement);
      }
    } else if (track.kind === Track.Kind.Audio) {
      const audioElement = document.createElement('audio');
      audioElement.id = `audio-${participant.identity}`;
      audioElement.autoplay = true;
      track.attach(audioElement);
      
      if (videoGridRef.current) {
        videoGridRef.current.appendChild(audioElement);
      }
    }
  };

  const handleTrackUnsubscribed = (track, publication, participant) => {
    if (track.kind === Track.Kind.Video) {
      const videoElement = document.getElementById(`video-${participant.identity}`);
      if (videoElement) {
        track.detach(videoElement);
        videoElement.remove();
      }
    } else if (track.kind === Track.Kind.Audio) {
      const audioElement = document.getElementById(`audio-${participant.identity}`);
      if (audioElement) {
        track.detach(audioElement);
        audioElement.remove();
      }
    }
  };

  const toggleMute = async () => {
    if (!room) return;
    
    try {
      await room.localParticipant.setMicrophoneEnabled(!isMuted);
      setIsMuted(!isMuted);
      
      // Notify other participants
      await updateParticipantState({ isMuted: !isMuted });
    } catch (error) {
      console.error('Error toggling mute:', error);
    }
  };

  const toggleVideo = async () => {
    if (!room) return;
    
    try {
      await room.localParticipant.setCameraEnabled(!isVideoOff);
      setIsVideoOff(!isVideoOff);
      
      // Notify other participants
      await updateParticipantState({ isVideoOff: !isVideoOff });
    } catch (error) {
      console.error('Error toggling video:', error);
    }
  };

  const toggleScreenShare = async () => {
    if (!room) return;
    
    try {
      if (isScreenSharing) {
        await room.localParticipant.setScreenShareEnabled(false);
        setIsScreenSharing(false);
      } else {
        await room.localParticipant.setScreenShareEnabled(true);
        setIsScreenSharing(true);
      }
      
      // Notify other participants
      await updateParticipantState({ isScreenSharing });
    } catch (error) {
      console.error('Error toggling screen share:', error);
    }
  };

  const updateParticipantState = async (state) => {
    if (!callInfo) return;
    
    try {
      await fetch(`/api/calls/${callInfo.id}/participant/state`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(state)
      });
    } catch (error) {
      console.error('Error updating participant state:', error);
    }
  };

  const handleEndCall = async () => {
    try {
      if (callInfo) {
        await fetch(`/api/calls/${callInfo.id}/end`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        });
      }
    } catch (error) {
      console.error('Error ending call:', error);
    }

    if (room) {
      room.disconnect();
    }
    
    navigate('/');
  };

  const handleCallEnded = (data) => {
    console.log('Call ended:', data);
    navigate('/');
  };

  const handleParticipantDisconnected = (data) => {
    console.log('Participant disconnected:', data);
    updateParticipants(room);
  };

  const handleParticipantStateChanged = (data) => {
    console.log('Participant state changed:', data);
    // Update participant state in UI
  };

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <div className="call-screen error">
        <div className="error-message">
          <h2>Ошибка звонка</h2>
          <p>{error}</p>
          <button onClick={() => navigate('/')}>Вернуться домой</button>
        </div>
      </div>
    );
  }

  return (
    <div className="call-screen">
      {/* Video Grid */}
      <div className="video-grid" ref={videoGridRef}>
        {/* Local video */}
        <div className="video-tile local-video">
          <div className="video-container">
            <video 
              ref={localVideoRef}
              autoPlay 
              muted 
              playsInline
              className="video-element"
            />
            {isVideoOff && (
              <div className="video-placeholder">
                <div className="avatar">
                  {callInfo?.initiator?.name?.[0] || 'U'}
                </div>
                <span>Вы</span>
              </div>
            )}
            {isMuted && (
              <div className="muted-indicator">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                  <path d="M19 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H19v-2z"/>
                </svg>
              </div>
            )}
          </div>
          <div className="participant-name">Вы</div>
        </div>

        {/* Remote participants */}
        {participants.map((participant) => (
          <div key={participant.identity} className="video-tile">
            <div className="video-container">
              <video 
                id={`video-${participant.identity}`}
                autoPlay 
                playsInline
                className="video-element"
              />
              <div className="participant-name">
                {participant.name || `Участник ${participant.identity}`}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Call Controls */}
      <div className="call-controls">
        <div className="call-info">
          <h3>{callInfo?.type === 'video' ? 'Видеозвонок' : 'Аудиозвонок'}</h3>
          <span className="duration">{formatDuration(duration)}</span>
        </div>

        <div className="control-buttons">
          <button 
            className={`control-button ${isMuted ? 'muted' : ''}`}
            onClick={toggleMute}
            aria-label={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
          >
            {isMuted ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M19 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H19v-2z"/>
                <path d="M3.27 3L2 4.27l6.01 6.01L11 7l8 8 1.41-1.41L3.27 3z"/>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            )}
          </button>

          <button 
            className={`control-button ${isVideoOff ? 'video-off' : ''}`}
            onClick={toggleVideo}
            aria-label={isVideoOff ? 'Включить камеру' : 'Выключить камеру'}
          >
            {isVideoOff ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M21 6.5L17 10.5V7C17 6.45 16.55 6 16 6H9.82l-2-2H16c1.1 0 2 .9 2 2v3.5l4-4.5v11l-1.41-1.41L21 6.5z"/>
                <path d="M3.27 2L2 3.27l4.73 4.73L3 17.5V6.5L7 10.5V7c0-.55.45-1 1-1h4.73L3.27 2z"/>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
              </svg>
            )}
          </button>

          <button 
            className={`control-button ${isScreenSharing ? 'sharing' : ''}`}
            onClick={toggleScreenShare}
            aria-label={isScreenSharing ? 'Остановить демонстрацию экрана' : 'Начать демонстрацию экрана'}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>
            </svg>
          </button>

          <button 
            className="control-button end-call"
            onClick={handleEndCall}
            aria-label="Завершить звонок"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <path d="M12 9c-1.6 0-3.15.25-4.6.7v1.55c1.35-.45 2.8-.7 4.6-.7s3.25.25 4.6.7V9.7C15.15 9.25 13.6 9 12 9z"/>
              <path d="M12 14.5c-1.1 0-2.1-.18-3-.5v1.6c.9.32 1.9.5 3 .5s2.1-.18 3-.5V14c-.9.32-1.9.5-3 .5z"/>
              <path d="M16 12.5V11c0-.55-.45-1-1-1H9c-.55 0-1 .45-1 1v1.5c0 .55.45 1 1 1h6c.55 0 1-.45 1-1z"/>
            </svg>
          </button>
        </div>
      </div>

      {!isConnected && (
        <div className="connecting-overlay">
          <div className="connecting-spinner"></div>
          <p>Подключение к звонку...</p>
        </div>
      )}
    </div>
  );
};

export default CallScreen;
