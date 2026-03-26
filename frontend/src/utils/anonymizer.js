/**
 * Utilities for anonymizing video and audio for anonymous profiles
 */

/**
 * Apply video blur effect to video element
 * @param {HTMLVideoElement} videoElement - Video element to anonymize
 * @param {Object} options - Blur options
 */
export function applyVideoBlur(videoElement, options = {}) {
  const {
    blurRadius = 10,
    pixelation = false,
    pixelSize = 10
  } = options;

  if (!videoElement) return;

  if (pixelation) {
    videoElement.style.filter = `blur(0px) pixelate(${pixelSize}px)`;
    videoElement.style.imageRendering = 'pixelated';
  } else {
    videoElement.style.filter = `blur(${blurRadius}px)`;
  }

  // Add CSS class for styling
  videoElement.classList.add('anonymous-video');
}

/**
 * Remove video blur effect
 * @param {HTMLVideoElement} videoElement - Video element to unmask
 */
export function removeVideoBlur(videoElement) {
  if (!videoElement) return;

  videoElement.style.filter = '';
  videoElement.style.imageRendering = '';
  videoElement.classList.remove('anonymous-video');
}

/**
 * Apply audio distortion to audio stream
 * @param {MediaStream} audioStream - Audio stream to anonymize
 * @param {Object} options - Distortion options
 * @returns {MediaStream} - Anonymized audio stream
 */
export function applyAudioDistortion(audioStream, options = {}) {
  const {
    pitchShift = 0.8, // Lower pitch for anonymity
    volumeReduction = 0.9,
    addNoise = true,
    noiseLevel = 0.1
  } = options;

  return new Promise((resolve, reject) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(audioStream);
      const destination = audioContext.createMediaStreamDestination();

      // Gain node for volume control
      const gainNode = audioContext.createGain();
      gainNode.gain.value = volumeReduction;

      // Pitch shifter (simplified version)
      const pitchShifter = audioContext.createScriptProcessor(4096, 1, 1);
      pitchShifter.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const output = e.outputBuffer.getChannelData(0);
        
        // Simple pitch shifting by changing playback rate simulation
        for (let i = 0; i < input.length; i++) {
          output[i] = input[i] * pitchShift;
        }
      };

      // Noise generator
      let noiseNode = null;
      if (addNoise) {
        noiseNode = audioContext.createScriptProcessor(4096, 1, 1);
        noiseNode.onaudioprocess = (e) => {
          const output = e.outputBuffer.getChannelData(0);
          for (let i = 0; i < output.length; i++) {
            output[i] = (Math.random() - 0.5) * noiseLevel;
          }
        };
      }

      // Connect audio nodes
      source.connect(gainNode);
      gainNode.connect(pitchShifter);
      pitchShifter.connect(destination);

      if (noiseNode) {
        noiseNode.connect(destination);
      }

      // Get the anonymized stream
      const anonymizedStream = destination.stream;
      resolve(anonymizedStream);

    } catch (error) {
      console.error('Error applying audio distortion:', error);
      reject(error);
    }
  });
}

/**
 * Create anonymous avatar display name
 * @param {Object} user - User object
 * @returns {string} - Anonymous display name
 */
export function getAnonymousDisplayName(user) {
  if (!user || !user.anonymous) {
    return user?.name || 'Unknown';
  }
  return 'Анонимный участник';
}

/**
 * Create anonymous avatar placeholder
 * @param {Object} user - User object
 * @returns {string} - Avatar text or emoji
 */
export function getAnonymousAvatar(user) {
  if (!user || !user.anonymous) {
    return user?.name?.[0] || '?';
  }
  return '👤';
}

/**
 * Check if user is anonymous and should be masked
 * @param {Object} user - User object
 * @returns {boolean} - True if user should be anonymized
 */
export function shouldAnonymize(user) {
  return user && user.anonymous === true;
}

/**
 * Apply anonymization to video track
 * @param {MediaStreamTrack} videoTrack - Video track to anonymize
 * @param {Object} options - Anonymization options
 * @returns {MediaStreamTrack} - Anonymized video track
 */
export function anonymizeVideoTrack(videoTrack, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      canvas.width = videoTrack.getSettings().width || 640;
      canvas.height = videoTrack.getSettings().height || 480;

      const video = document.createElement('video');
      video.srcObject = new MediaStream([videoTrack]);
      video.play();

      video.onloadedmetadata = () => {
        const processedTrack = canvas.captureStream(30).getVideoTracks()[0];
        
        // Apply processing in real-time
        const processFrame = () => {
          ctx.filter = options.blurRadius ? `blur(${options.blurRadius}px)` : '';
          
          if (options.pixelation) {
            const pixelSize = options.pixelSize || 10;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(video, 0, 0, canvas.width / pixelSize, canvas.height / pixelSize);
            ctx.drawImage(canvas, 0, 0, canvas.width / pixelSize, canvas.height / pixelSize, 0, 0, canvas.width, canvas.height);
          } else {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          }
          
          requestAnimationFrame(processFrame);
        };

        processFrame();
        resolve(processedTrack);
      };

    } catch (error) {
      console.error('Error anonymizing video track:', error);
      reject(error);
    }
  });
}

/**
 * Create anonymous participant info for display
 * @param {Object} participant - Participant object
 * @returns {Object} - Anonymized participant info
 */
export function createAnonymousParticipantInfo(participant) {
  const isAnonymous = shouldAnonymize(participant);
  
  return {
    ...participant,
    name: isAnonymous ? getAnonymousDisplayName(participant) : participant.name,
    avatar: isAnonymous ? getAnonymousAvatar(participant) : participant.avatar,
    isAnonymous,
    showRealInfo: !isAnonymous
  };
}

/**
 * CSS class for anonymous video styling
 */
export const ANONYMOUS_VIDEO_CLASS = 'anonymous-video';

/**
 * Default anonymization options
 */
export const DEFAULT_ANONYMIZATION_OPTIONS = {
  video: {
    blurRadius: 8,
    pixelation: false,
    pixelSize: 10
  },
  audio: {
    pitchShift: 0.8,
    volumeReduction: 0.9,
    addNoise: true,
    noiseLevel: 0.1
  }
};
