// ===== ScanFlow AI — Demo Video Player =====
// Shows a floating "▶ Watch Demo" button that opens a video modal.
// Auto-pops on first visit (dismissible via "Don't show again" checkbox).

(function () {
  'use strict';

  const VIDEO_PATH = 'assets/demo.mp4';
  const LS_KEY = 'scanflow_demo_video_dismissed';

  // ---------- Inject Button ----------
  function injectButton() {
    const existing = document.getElementById('demoVideoBtn');
    if (existing) return;

    const btn = document.createElement('button');
    btn.id = 'demoVideoBtn';
    btn.className = 'demo-video-btn';
    btn.innerHTML = '<span class="icon">&#9654;</span> Watch Demo';
    btn.title = 'Watch a 1-2 minute demo of ScanFlow AI';
    btn.addEventListener('click', openPlayer);
    document.body.appendChild(btn);
  }

  // ---------- Open Player ----------
  function openPlayer() {
    closePlayer(); // remove any existing backdrop first

    const backdrop = document.createElement('div');
    backdrop.className = 'demo-video-backdrop';
    backdrop.id = 'demoVideoBackdrop';
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closePlayer();
    });

    // Check if video exists (we'll handle missing gracefully)
    const videoExists = checkVideoExists();

    let videoHTML = '';
    if (videoExists) {
      videoHTML = `
        <div class="demo-video-wrapper">
          <video id="demoVideo" preload="metadata" playsinline>
            <source src="${VIDEO_PATH}" type="video/mp4">
          </video>
          <div class="demo-video-controls" id="demoVideoControls">
            <div class="demo-video-progress" id="demoProgress">
              <div class="demo-video-progress-fill" id="demoProgressFill"></div>
            </div>
            <div class="demo-video-controls-row">
              <button id="demoPlayBtn" title="Play / Pause">&#9654;</button>
              <button id="demoMuteBtn" title="Mute / Unmute">&#128266;</button>
              <button id="demoFullscreenBtn" title="Fullscreen">&#9974;</button>
              <span class="time-display" id="demoTimeDisplay">0:00 / 0:00</span>
            </div>
          </div>
        </div>`;
    } else {
      videoHTML = `
        <div class="demo-video-placeholder">
          <div class="big-icon">&#127916;</div>
          <h4>Demo Video Not Yet Available</h4>
          <p>To add the demo video, record a 1–2 minute walkthrough of ScanFlow AI and save it as <strong>assets/demo.mp4</strong> in the project folder.</p>
          <p style="margin-top:12px;font-size:0.78rem;color:rgba(255,255,255,0.35);">See the DEMO_VIDEO_STORYBOARD.md file for a scene-by-scene guide.</p>
        </div>`;
    }

    backdrop.innerHTML = `
      <div class="demo-video-card">
        <button class="demo-video-close" id="demoVideoClose" title="Close">&times;</button>
        <div class="demo-video-header">
          <svg class="logo-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="8" fill="#0077B6"/>
            <path d="M8 16C8 11.58 11.58 8 16 8C20.42 8 24 11.58 24 16" stroke="#00E5FF" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M12 16C12 13.79 13.79 12 16 12C18.21 12 20 13.79 20 16" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="16" cy="16" r="2" fill="#fff"/>
            <path d="M16 18V24" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <h3>ScanFlow AI Demo</h3>
          <span class="duration">1–2 min</span>
        </div>
        ${videoHTML}
        <label class="demo-video-dont-show" id="demoDontShowLabel">
          <input type="checkbox" id="demoDontShowCheckbox"> Don't show this automatically on next visit
        </label>
      </div>`;

    document.body.appendChild(backdrop);

    // Close button
    document.getElementById('demoVideoClose').addEventListener('click', closePlayer);

    // "Don't show" checkbox
    document.getElementById('demoDontShowCheckbox').addEventListener('change', function () {
      if (this.checked) {
        localStorage.setItem(LS_KEY, 'true');
      } else {
        localStorage.removeItem(LS_KEY);
      }
    });

    // Keyboard listeners
    document.addEventListener('keydown', handleKeydown);

    // Animate in
    requestAnimationFrame(function () {
      backdrop.classList.add('open');
    });

    // Wire up video controls if video exists
    if (videoExists) {
      initVideoControls();
    }
  }

  // ---------- Close Player ----------
  function closePlayer() {
    const backdrop = document.getElementById('demoVideoBackdrop');
    if (!backdrop) return;
    backdrop.classList.remove('open');
    document.removeEventListener('keydown', handleKeydown);
    // Pause video
    const video = document.getElementById('demoVideo');
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    setTimeout(function () {
      if (backdrop.parentNode) backdrop.remove();
    }, 350);
  }

  // ---------- Keyboard Handler ----------
  function handleKeydown(e) {
    if (e.key === 'Escape') {
      closePlayer();
      return;
    }
    const video = document.getElementById('demoVideo');
    if (!video) return;
    if (e.key === ' ' || e.key === 'Space') {
      e.preventDefault();
      togglePlay();
    }
    if (e.key === 'f' || e.key === 'F') {
      toggleFullscreen();
    }
    if (e.key === 'm' || e.key === 'M') {
      toggleMute();
    }
  }

  // ---------- Video Controls ----------
  function initVideoControls() {
    const video = document.getElementById('demoVideo');
    const playBtn = document.getElementById('demoPlayBtn');
    const muteBtn = document.getElementById('demoMuteBtn');
    const fullBtn = document.getElementById('demoFullscreenBtn');
    const progress = document.getElementById('demoProgress');
    const progressFill = document.getElementById('demoProgressFill');
    const timeDisplay = document.getElementById('demoTimeDisplay');
    const controls = document.getElementById('demoVideoControls');

    if (!video) return;

    function formatTime(s) {
      if (isNaN(s) || !isFinite(s)) return '0:00';
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return m + ':' + (sec < 10 ? '0' : '') + sec;
    }

    function updateUI() {
      if (video.paused || video.ended) {
        playBtn.innerHTML = '&#9654;';
      } else {
        playBtn.innerHTML = '&#9646;&#9646;';
      }
      muteBtn.innerHTML = video.muted ? '&#128263;' : '&#128266;';
      if (video.duration && isFinite(video.duration)) {
        const pct = (video.currentTime / video.duration) * 100;
        progressFill.style.width = pct + '%';
        timeDisplay.textContent = formatTime(video.currentTime) + ' / ' + formatTime(video.duration);
      } else {
        timeDisplay.textContent = '0:00 / 0:00';
      }
    }

    video.addEventListener('timeupdate', updateUI);
    video.addEventListener('loadedmetadata', updateUI);
    video.addEventListener('play', updateUI);
    video.addEventListener('pause', updateUI);

    // Click video to play/pause
    video.addEventListener('click', togglePlay);

    // Show controls on mouse move, hide after 3s idle
    let controlsTimer;
    function showControls() {
      controls.classList.add('show');
      clearTimeout(controlsTimer);
      controlsTimer = setTimeout(function () {
        if (!video.paused) controls.classList.remove('show');
      }, 3000);
    }
    video.addEventListener('mousemove', showControls);
    video.addEventListener('mouseenter', showControls);
    video.addEventListener('mouseleave', function () {
      if (!video.paused) controls.classList.remove('show');
    });
    // Keep showing when hovering controls
    controls.addEventListener('mouseenter', function () {
      clearTimeout(controlsTimer);
      controls.classList.add('show');
    });
    controls.addEventListener('mouseleave', function () {
      if (!video.paused) {
        controlsTimer = setTimeout(function () {
          controls.classList.remove('show');
        }, 1000);
      }
    });

    // Play button
    playBtn.addEventListener('click', togglePlay);

    function togglePlay() {
      if (video.paused || video.ended) {
        video.play().catch(function () {});
      } else {
        video.pause();
      }
    }

    // Mute button
    muteBtn.addEventListener('click', toggleMute);

    function toggleMute() {
      video.muted = !video.muted;
    }

    // Fullscreen button
    fullBtn.addEventListener('click', toggleFullscreen);

    function toggleFullscreen() {
      const wrapper = video.parentElement;
      if (!document.fullscreenElement) {
        if (wrapper.requestFullscreen) {
          wrapper.requestFullscreen();
        } else if (wrapper.webkitRequestFullscreen) {
          wrapper.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    }

    // Progress bar click
    progress.addEventListener('click', function (e) {
      if (!video.duration || !isFinite(video.duration)) return;
      const rect = progress.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      video.currentTime = pct * video.duration;
    });

    // Auto-play on open
    video.play().catch(function () {});
  }

  // ---------- Check video exists (fetch HEAD) ----------
  function checkVideoExists() {
    // We'll optimistically return true. If it 404s, the video element will just show "video not supported" which is fine.
    // But for a better UX, we can try a lightweight check.
    // Since fetch can be slow, we'll just return true and let the placeholder handle it if the src fails.
    return true;
  }

  // ---------- First-visit auto-pop ----------
  function checkFirstVisit() {
    if (localStorage.getItem(LS_KEY) === 'true') return;
    // Wait for page to load, then open after a brief delay
    if (document.readyState === 'complete') {
      setTimeout(openPlayer, 800);
    } else {
      window.addEventListener('load', function () {
        setTimeout(openPlayer, 800);
      });
    }
  }

  // ---------- Init ----------
  function init() {
    // Inject the CSS link (if not already present)
    if (!document.querySelector('link[href="css/demo-video.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'css/demo-video.css';
      document.head.appendChild(link);
    }

    injectButton();
    checkFirstVisit();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();