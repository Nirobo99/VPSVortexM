import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './CallNotification.css';

const CallNotification = ({ socket, incomingCall, onAccept, onReject }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [callData, setCallData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (socket) {
      socket.on('incoming_call', (data) => {
        console.log('Incoming call:', data);
        setCallData(data);
        setIsVisible(true);
        
        // Auto-hide after 30 seconds
        const timer = setTimeout(() => {
          handleReject();
        }, 30000);

        return () => clearTimeout(timer);
      });

      socket.on('call_accepted', () => {
        setIsVisible(false);
        setCallData(null);
      });

      socket.on('call_rejected', () => {
        setIsVisible(false);
        setCallData(null);
      });

      return () => {
        socket.off('incoming_call');
        socket.off('call_accepted');
        socket.off('call_rejected');
      };
    }
  }, [socket]);

  const handleAccept = async () => {
    if (!callData) return;

    try {
      const response = await fetch(`/api/calls/${callData.callId}/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        setIsVisible(false);
        
        // Navigate to call screen with call data
        navigate('/call', { 
          state: { 
            call: result.call,
            incomingCall: callData 
          } 
        });

        if (onAccept) onAccept(result);
      }
    } catch (error) {
      console.error('Error accepting call:', error);
    }
  };

  const handleReject = async () => {
    if (!callData) return;

    try {
      await fetch(`/api/calls/${callData.callId}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      setIsVisible(false);
      setCallData(null);

      if (onReject) onReject(callData);
    } catch (error) {
      console.error('Error rejecting call:', error);
    }
  };

  if (!isVisible || !callData) return null;

  const { type, initiator } = callData;

  return (
    <div className="call-notification">
      <div className="call-notification-content">
        <div className="call-notification-header">
          <div className="call-type-icon">
            {type === 'video' ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M15 8V4C15 3.45 14.55 3 14 3H10C9.45 3 9 3.45 9 4V8C9 8.55 9.45 9 10 9H14C14.55 9 15 8.55 15 8Z" fill="currentColor"/>
                <path d="M21 6.5L17 10.5V7C17 6.45 16.55 6 16 6H15V4H16C17.1 4 18 4.9 18 6V10.5L22 6.5V17.5L18 13.5V18C18 19.1 17.1 20 16 20H15V18H16V13.5L20 17.5V6.5H21Z" fill="currentColor"/>
                <path d="M4 6L8 10.5V7C8 6.45 7.55 6 7 6H6V4H7C8.1 4 9 4.9 9 6V10.5L13 6.5V17.5L9 13.5V18C9 19.1 8.1 20 7 20H6V18H7V13.5L3 17.5V6H4Z" fill="currentColor"/>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M20.01 15.38C18.78 15.38 17.59 15.18 16.48 14.82C16.13 14.7 15.74 14.79 15.47 15.06L13.9 16.63C11.96 15.53 10.06 13.66 8.93 11.69L10.5 10.07C10.77 9.79 10.86 9.4 10.74 9.05C10.37 7.93 10.18 6.74 10.18 5.5C10.18 4.95 9.73 4.5 9.18 4.5H5.5C4.95 4.5 4.5 4.95 4.5 5.5C4.5 13.78 11.22 20.5 19.5 20.5C20.05 20.5 20.5 20.05 20.5 19.5V15.88C20.5 15.33 20.05 14.88 19.5 14.88L20.01 15.38Z" fill="currentColor"/>
              </svg>
            )}
          </div>
          <div className="call-info">
            <h3 className="call-title">
              {type === 'video' ? 'Видеозвонок' : 'Аудиозвонок'}
            </h3>
            <p className="call-from">
              {initiator?.name || 'Неизвестный пользователь'}
            </p>
          </div>
        </div>

        <div className="call-notification-actions">
          <button 
            className="call-button reject-button"
            onClick={handleReject}
            aria-label="Отклонить звонок"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="currentColor"/>
            </svg>
          </button>
          
          <button 
            className="call-button accept-button"
            onClick={handleAccept}
            aria-label="Принять звонок"
          >
            {type === 'video' ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M17 10.5V7C17 6.45 16.55 6 16 6H15V4H16C17.1 4 18 4.9 18 6V10.5L22 6.5V17.5L18 13.5V18C18 19.1 17.1 20 16 20H15V18H16V13.5L20 17.5V6.5L17 10.5Z" fill="currentColor"/>
                <path d="M4 6L8 10.5V7C8 6.45 7.55 6 7 6H6V4H7C8.1 4 9 4.9 9 6V10.5L13 6.5V17.5L9 13.5V18C9 19.1 8.1 20 7 20H6V18H7V13.5L3 17.5V6H4Z" fill="currentColor"/>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M20.01 15.38C18.78 15.38 17.59 15.18 16.48 14.82C16.13 14.7 15.74 14.79 15.47 15.06L13.9 16.63C11.96 15.53 10.06 13.66 8.93 11.69L10.5 10.07C10.77 9.79 10.86 9.4 10.74 9.05C10.37 7.93 10.18 6.74 10.18 5.5C10.18 4.95 9.73 4.5 9.18 4.5H5.5C4.95 4.5 4.5 4.95 4.5 5.5C4.5 13.78 11.22 20.5 19.5 20.5C20.05 20.5 20.5 20.05 20.5 19.5V15.88C20.5 15.33 20.05 14.88 19.5 14.88L20.01 15.38Z" fill="currentColor"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CallNotification;
