
// ==========================================
// Time-Frequency Analysis (STFT) App
// Based on Fourier 3D Engine
// ==========================================

class SignalComponent {
    constructor(freq, amp, startTime = 0, envelopeType = 'gaussian') {
        this.freq = freq;
        this.amp = amp;
        this.id = Math.random().toString(36).substr(2, 9);
        this.startTime = startTime;
        this.endTime = 5.0;
        this.envelopeType = envelopeType;
        this.envelopeParams = { 
            gaussian: { center: 0.5, width: 0.2 },
            adsr: { a: 0.1, d: 0.1, s: 0.5, r: 0.2 },
            square: {}
        };
        this.phase = 0;
        this.waveType = 'sine';
        this.collapsed = false;
    }
}

const state = {
    components: [
        new SignalComponent(2, 1.0, 0, 'gaussian'),
        new SignalComponent(5, 0.5, 0, 'gaussian')
    ],
    sampleRate: 256,
    showAxis: true,
    signalMode: 'real',
    audioMultiplier: 50,
    masterVolume: 0.5,
    ampMultiplier: 1.0,
    fftSampling: 2,
    fftSmoothing: true,
    showReIm: false,
    zoomStart: 0,
    zoomEnd: 5.0, // Fixed total duration 5.0s
    selectedTime: 0.5,
    isDraggingTime: false,
    isPanningSignal: false,
    viewAbs: { startFreq: 0, endFreq: 0, isPanning: false },
    selectedFrequency: 2.0,
    isDraggingFreq: false,
    lastMouse: { x: 0, y: 0 },
    isSidebarCollapsed: false,
    
    // STFT Specific
    transformType: 'gabor', // 'gabor', 'double_gabor', 'wavelet', 'wigner', 'chirplet'
    windowType: 'gaussian', // 'gaussian' | 'square'
    windowWidth: 0.2, // Primary Window
    windowWidth2: 0.5, // Secondary Window (Double)
    chirpRate: 0, // Chirp Rate
    spectrogramLogScale: false,
    stftTimeRes: 400, 
    stftFreqRes: 512, 

    // Memory Optimization Buffers (From F3D)
    buffers: {
        complexSignal: [],
        displaySignal: [],
        fftEven: [],
        fftOdd: [],
        fftOutput: []
    }
};

// Memory Helper
function ensureObjectArray(arr, size, factory) {
    while (arr.length < size) {
        arr.push(factory());
    }
    return arr;
}

const elements = {
    componentsContainer: document.getElementById('components-container'),
    componentsWrapper: document.getElementById('components-wrapper'),
    addComponentBtn: document.getElementById('add-component-btn'),
    axisToggle: document.getElementById('axis-toggle'),
    reimToggle: document.getElementById('reim-toggle'),
    resetBtn: document.getElementById('reset-btn'),
    hardReloadBtn: document.getElementById('hard-reload-btn'),
    audioMultSlider: document.getElementById('audio-mult-slider'),
    audioMultDisplay: document.getElementById('audio-mult-display'),
    fftSamplingSlider: document.getElementById('fft-sampling-slider'),
    fftSmoothingToggle: document.getElementById('fft-smoothing-toggle'),
    
    // STFT Controls
    transformSelect: document.getElementById('transform-type-select'),
    transformDesc: document.getElementById('transform-desc'),
    windowWidthSlider: document.getElementById('window-width-slider'),
    windowWidthDisplay: document.getElementById('window-width-display'),
    windowPreviewCanvas: document.getElementById('window-preview-canvas'),
    
    // New Controls
    windowWidth2Slider: document.getElementById('window-width-2-slider'),
    windowWidth2Display: document.getElementById('window-width-2-display'),
    windowPreviewCanvas2: document.getElementById('window-preview-canvas-2'), // Added second canvas
    
    chirpRateSlider: document.getElementById('chirp-rate-slider'),
    chirpRateDisplay: document.getElementById('chirp-rate-display'),
    
    // Visibility Groups
    windowControlsGroup: document.getElementById('window-controls-group'),
    widthControl1: document.getElementById('width-control-1'),
    widthControl2: document.getElementById('width-control-2'),
    chirpControl: document.getElementById('chirp-control'),
    widthLabel1: document.getElementById('width-label-1'),
    
    stftTimeResSlider: document.getElementById('stft-time-res-slider'),
    stftTimeResDisplay: document.getElementById('stft-time-res-display'),
    
    canvases: {
        signal: document.getElementById('signal-canvas'),
        spectrogram: document.getElementById('spectrogram-canvas'),
        absTransform: document.getElementById('abs-transform-canvas'),
        winding: document.getElementById('winding-canvas'),
        
        winding: document.getElementById('winding-canvas')
    },
    
    // Window Preview Elements (NOT Contexts)
    windowPreview: document.getElementById('window-preview-canvas'),
    windowPreview2: document.getElementById('window-preview-canvas-2'),
    
    ctx: {},
    plotInfo: document.getElementById('freq-info'),
    timeInfo: document.getElementById('time-info')
};

Object.keys(elements.canvases).forEach(k => {
    if(elements.canvases[k] && typeof elements.canvases[k].getContext === 'function') elements.ctx[k] = elements.canvases[k].getContext('2d');
    else elements.ctx[k] = null;
});


let audioCtx = null;
let isPlaying = null;
let audioStartTime = 0;
let currentSource = null;

const STORAGE_KEY = 'timefreq_state_v1';

function init() {
    loadState();
    syncGlobalControls();
    renderComponentsUI();
    setupListeners();
    updateSignalSliderUI();
    updateFreqSliderUI();
    drawWindowPreview();
    animate();
}

function syncGlobalControls() {
    if (elements.axisToggle) elements.axisToggle.checked = state.showAxis;
    if (elements.reimToggle) elements.reimToggle.checked = state.showReIm;
    if (elements.audioMultSlider) {
        elements.audioMultSlider.value = state.audioMultiplier;
        elements.audioMultDisplay.innerText = state.audioMultiplier;
    }
    if (elements.fftSamplingSlider) elements.fftSamplingSlider.value = state.fftSampling;
    if (elements.fftSmoothingToggle) elements.fftSmoothingToggle.checked = state.fftSmoothing;
    
    if (elements.windowWidthSlider) {
        elements.windowWidthSlider.value = state.windowWidth;
        elements.windowWidthDisplay.innerText = state.windowWidth.toFixed(2) + 's';
    }
    
    // Restore new params
    if(state.transformType) {
        if(elements.transformSelect) elements.transformSelect.value = state.transformType;
        updateTransformUI(state.transformType);
    }
    if(elements.windowWidth2Slider) { 
        elements.windowWidth2Slider.value = state.windowWidth2; 
        elements.windowWidth2Display.innerText = state.windowWidth2.toFixed(2) + 's';
    }
    if(elements.chirpRateSlider) {
        elements.chirpRateSlider.value = state.chirpRate;
        elements.chirpRateDisplay.innerText = state.chirpRate;
    }

    setWindowType(state.windowType);
    
    // Sync Res Controls
    if(elements.stftTimeResSlider) {
        elements.stftTimeResSlider.value = state.stftTimeRes;
        elements.stftTimeResDisplay.innerText = state.stftTimeRes;
    }
    setFFTSize(state.stftFreqRes);
    
    const logToggle = document.getElementById('spectrogram-log-toggle');
    if(logToggle) logToggle.checked = state.spectrogramLogScale;

    if (state.ampMultiplier !== undefined) {
        const el = document.getElementById('global-amp-slider');
        const disp = document.getElementById('global-amp-display');
        if (el) el.value = state.ampMultiplier;
        if (disp) disp.innerText = state.ampMultiplier.toFixed(1);
    }
    
    if (state.isSidebarCollapsed) {
        document.body.classList.add('sidebar-collapsed');
    } else {
        document.body.classList.remove('sidebar-collapsed');
    }
    const sbBtn = document.getElementById('toggle-sidebar-btn');
    if (sbBtn) {
        if (document.body.classList.contains('sidebar-collapsed')) sbBtn.innerHTML = '<span class="material-symbols-outlined">chevron_right</span>';
        else sbBtn.innerHTML = '<span class="material-symbols-outlined">chevron_left</span>';
    }
}

window.toggleSidebar = () => {
    document.body.classList.toggle('sidebar-collapsed');
    state.isSidebarCollapsed = document.body.classList.contains('sidebar-collapsed');
    const btn = document.getElementById('toggle-sidebar-btn');
    if (state.isSidebarCollapsed) {
        btn.innerHTML = '<span class="material-symbols-outlined">chevron_right</span>';
        btn.title = "Show Sidebar";
    } else {
        btn.innerHTML = '<span class="material-symbols-outlined">chevron_left</span>';
        btn.title = "Hide Sidebar";
    }
    saveState();
    setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 100);
};

function saveState() {
    const saved = {
        components: state.components,
        signalMode: state.signalMode,
        audioMultiplier: state.audioMultiplier,
        ampMultiplier: state.ampMultiplier,
        zoomStart: state.zoomStart,
        zoomEnd: state.zoomEnd,
        showAxis: state.showAxis,
        fftSampling: state.fftSampling,
        fftSmoothing: state.fftSmoothing,
        showReIm: state.showReIm,
        viewAbs: state.viewAbs,
        windowType: state.windowType,
        windowWidth: state.windowWidth,
        spectrogramLogScale: state.spectrogramLogScale,
        stftTimeRes: state.stftTimeRes,
        stftFreqRes: state.stftFreqRes,
        isSidebarCollapsed: state.isSidebarCollapsed
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state.components = parsed.components.map(c => {
                const n = new SignalComponent(c.freq, c.amp);
                Object.assign(n, c);
                if (!n.waveType) n.waveType = 'sine';
                return n;
            });
            if (parsed.audioMultiplier) state.audioMultiplier = parsed.audioMultiplier;
            if (parsed.ampMultiplier !== undefined) state.ampMultiplier = Number(parsed.ampMultiplier);
            if (parsed.zoomStart !== undefined) state.zoomStart = parsed.zoomStart;
            if (parsed.zoomEnd !== undefined) state.zoomEnd = parsed.zoomEnd;
            if (parsed.showAxis !== undefined) state.showAxis = parsed.showAxis;
            if (parsed.showReIm !== undefined) state.showReIm = parsed.showReIm;
            if (parsed.fftSampling !== undefined) state.fftSampling = parseFloat(parsed.fftSampling);
            if (parsed.fftSmoothing !== undefined) state.fftSmoothing = !!parsed.fftSmoothing;
            if (parsed.viewAbs) state.viewAbs = parsed.viewAbs;
            if (parsed.windowType) state.windowType = parsed.windowType;
            if (parsed.windowWidth) state.windowWidth = parsed.windowWidth;
            if (parsed.windowWidth2) state.windowWidth2 = parsed.windowWidth2;
            if (parsed.transformType) state.transformType = parsed.transformType;
            if (parsed.chirpRate !== undefined) state.chirpRate = parsed.chirpRate;
            if (parsed.spectrogramLogScale !== undefined) state.spectrogramLogScale = parsed.spectrogramLogScale;
            if (parsed.stftTimeRes) state.stftTimeRes = parsed.stftTimeRes;
            if (parsed.stftFreqRes) state.stftFreqRes = parsed.stftFreqRes;
            if (parsed.isSidebarCollapsed !== undefined) state.isSidebarCollapsed = parsed.isSidebarCollapsed;

            // Clear buffers on load to prevent corruption
            state.buffers.stftInput = [];
            state.buffers.stftOutput = [];
            state.buffers.fftOutput = [];
        } catch (e) { console.error(e); }
    }
}

// STFT Res Control Help
window.setFFTSize = (size) => {
    state.stftFreqRes = size;
    // UI Update
    document.querySelectorAll('.segmented-option').forEach(el => {
        if(el.id.startsWith('fft-')) el.classList.remove('active');
    });
    const activeBtn = document.getElementById(`fft-${size}`);
    if(activeBtn) activeBtn.classList.add('active');
    saveState();
};

// Window Type
window.setWindowType = (type) => {
    state.windowType = type;
    document.querySelectorAll('.segmented-option').forEach(el => el.classList.remove('active'));
    // Manual Update of UI classes since unique ID might conflict if reused
    const btnG = document.getElementById('window-gaussian');
    const btnS = document.getElementById('window-square');
    if(type === 'gaussian' && btnG) btnG.classList.add('active');
    if(type === 'square' && btnS) btnS.classList.add('active');
    drawWindowPreview();
    saveState();
}

function drawWindowPreview() {
    // Re-fetch elements to be safe
    let canvas = elements.windowPreviewCanvas;
    if(canvas && !elements.ctx.windowPreview) elements.ctx.windowPreview = canvas.getContext('2d');
    
    if(!canvas) {
        canvas = document.getElementById('window-preview-canvas');
        if(canvas) {
            elements.windowPreviewCanvas = canvas;
            elements.ctx.windowPreview = canvas.getContext('2d');
        }
    }
    
    if(!canvas || !elements.ctx.windowPreview) return;
    
    const ctx = elements.ctx.windowPreview;
    
    // Fix DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if(rect.width === 0 || rect.height === 0) return; // Not visible
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const w = rect.width;
    const h = rect.height;
    
    ctx.clearRect(0,0,w,h);
    
    // Force Gaussian for Wigner-Ville visual
    const effectiveType = (state.transformType === 'wigner') ? 'gaussian' : state.windowType;

    drawWindowCurve(ctx, w, h, state.windowWidth, effectiveType, false);
    
    // Draw Second Window if visible
    if(state.transformType === 'double_gabor') { 
         let c2 = elements.windowPreviewCanvas2;
         if(!c2) {
             c2 = document.getElementById('window-preview-canvas-2');
             if(c2) {
                 elements.windowPreviewCanvas2 = c2;
                 elements.ctx.windowPreview2 = c2.getContext('2d');
             }
         }
         else if(c2 && !elements.ctx.windowPreview2) {
             elements.ctx.windowPreview2 = c2.getContext('2d');
         }

         if(c2 && elements.ctx.windowPreview2) {
             const ctx2 = elements.ctx.windowPreview2;
             const rect2 = c2.getBoundingClientRect();
             if(rect2.width > 0 && rect2.height > 0) {
                 c2.width = rect2.width * dpr;
                 c2.height = rect2.height * dpr;
                 ctx2.scale(dpr,dpr);
                 ctx2.clearRect(0,0, rect2.width, rect2.height);
                 drawWindowCurve(ctx2, rect2.width, rect2.height, state.windowWidth2, effectiveType, false);
             }
         }
    }
}

function drawWindowCurve(ctx, w, h, widthSecs, type, isChirp) {
     // Let's assume Canvas Width represents 1.0 Second for visualization context? 
     // Or just normalize so 1.0s = full width.
     
     const samplesPerCanvas = w; // 1 pixel = 1 slice
     // effective width in pixels = widthSecs * w (if canvas is 1s).
     // Let's assume canvas is 1.2s to leave margin.
     const maxSecs = 1.2;
     
     const sigmaPixels = (widthSecs / maxSecs) * w / 6; 
     const mid = w / 2;
     
     ctx.beginPath();
     ctx.strokeStyle = '#1484e6';
     ctx.lineWidth = 2;
     
     const step = 1;
     
     for(let i=0; i<=w; i+=step) {
         let val = 0;
         const x = i - mid;
         
         if(type === 'square') {
             // Square width in pixels
             const halfW = ((widthSecs / maxSecs) * w) / 2;
             val = (Math.abs(x) <= halfW) ? 1.0 : 0.0;
         } else {
             // Gaussian
             val = Math.exp(-(x*x)/(2*sigmaPixels*sigmaPixels));
         }
         
         const plotY = h - (val * (h-10)) - 5; 
         
         if(i===0) ctx.moveTo(i, plotY);
         else ctx.lineTo(i, plotY);
     }
     ctx.stroke();
     
     // Fill
     ctx.lineTo(w, h);
     ctx.lineTo(0, h);
     ctx.fillStyle = 'rgba(20, 132, 230, 0.1)';
     ctx.fill();
}

window.toggleSpectrogramLog = () => {
    const el = document.getElementById('spectrogram-log-toggle');
    if(el) {
        state.spectrogramLogScale = el.checked;
        saveState();
    }
}

// ----------------------------------------------------
// COMPONENTS UI (From Fourier3D)
// ----------------------------------------------------

window.updateComponent = (id, prop, value) => {
    const c = state.components.find(x => x.id === id);
    if (c) {
        c[prop] = parseFloat(value);
        const valElem = document.getElementById((prop === 'freq' ? 'f-val-' : (prop === 'amp' ? 'a-val-' : 'p-val-')) + id);
        if (valElem) {
            let label = value;
            if (prop === 'freq') label += ' Hz';
            else if (prop === 'phase') label = parseFloat(value).toFixed(2) + ' rad';
            valElem.innerText = label;
        }
        drawComponentPreview(document.getElementById(`preview-${c.id}`), c);
        drawEnvelopePreview(document.getElementById(`env-prev-${c.id}`), c);
        saveState();
    }
};

window.removeComponent = (idx) => {
    state.components.splice(idx, 1);
    renderComponentsUI();
    saveState();
}

window.setWaveType = (id, type) => {
    const c = state.components.find(x => x.id === id);
    if(c) { c.waveType = type; renderComponentsUI(); saveState(); }
}

window.setEnvelopeType = (id, type) => {
    const c = state.components.find(x => x.id === id);
    if (c) {
        c.envelopeType = type;
        renderComponentsUI();
        saveState();
    }
};

window.updateEnvParam = (id, type, param, value) => {
    const c = state.components.find(x => x.id === id);
    if (c) {
        c.envelopeParams[type][param] = parseFloat(value);
        saveState();
        drawEnvelopePreview(document.getElementById(`env-prev-${id}`), c);
    }
};

window.toggleCollapse = (id) => {
    const c = state.components.find(x => x.id === id);
    if (c) {
        c.collapsed = !c.collapsed;
        renderComponentsUI();
        saveState();
    }
};

window.updateTimeConstraint = (id, type, value) => {
    const c = state.components.find(x => x.id === id);
    if (!c) return;
    updateTimeConstraintLogic(c, type, parseFloat(value));
};

function updateTimeConstraintLogic(comp, type, value) {
    // Correct logic from Fourier3D
    if (type === 'start') {
        if (value >= comp.endTime) {
            comp.endTime = Math.min(value + 0.1, 5.0);
            if (comp.endTime === 5.0 && value > 4.9) value = 4.9;
        }
        comp.startTime = value;
    } else {
        if (value <= comp.startTime) {
            comp.startTime = Math.max(value - 0.1, 0);
            if (comp.startTime === 0 && value < 0.1) value = 0.1;
        }
        comp.endTime = value;
    }

    const pv = document.getElementById(`preview-${comp.id}`);
    if (pv && pv.closest('.component-body')) {
        const wrap = pv.closest('.component-body');
        const tf = wrap.querySelector('.double-slider-fill');
        const ips = wrap.querySelectorAll('.double-slider-input');
        const MAX = 5.0;

        if (tf) {
            tf.style.left = (comp.startTime / MAX) * 100 + '%';
            tf.style.width = ((comp.endTime - comp.startTime) / MAX) * 100 + '%';
        }

        if (ips.length === 2) {
            if (type === 'start') ips[1].value = comp.endTime;
            else ips[0].value = comp.startTime;
        }

        const lb = document.getElementById(`time-label-${comp.id}`);
        if (lb) lb.innerHTML = `TIME (${comp.startTime.toFixed(2)}s - ${comp.endTime.toFixed(2)}s)`;
    }
    saveState();
}

function renderComponentsUI() {
    elements.componentsContainer.innerHTML = '';
    state.components.forEach((comp, index) => {
        const el = document.createElement('div');
        el.className = 'component-row';
        const pf = (Math.PI / 16);
        el.innerHTML = `
            <div class="component-header">
                <span>WAVE ${index + 1}</span>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="material-symbols-outlined remove-btn" style="font-size: 18px;" onclick="window.toggleCollapse('${comp.id}')">
                        ${comp.collapsed ? 'expand_more' : 'expand_less'}
                    </span>
                    <span class="material-symbols-outlined remove-btn" style="font-size: 16px;" onclick="removeComponent(${index})">close</span>
                </div>
            </div>
            ${comp.collapsed ? `
                <div class="component-collapsed-preview">
                    <canvas id="col-prev-${comp.id}" width="300" height="40"></canvas>
                </div>
            ` : `
            <div class="component-body">
                <div class="component-collapsed-preview" style="margin-bottom: 2px;">
                    <canvas id="exp-col-prev-${comp.id}" width="300" height="40"></canvas>
                </div>
                <div class="component-controls" style="display: flex; flex-direction: column; gap: 8px;">
                     <!-- Wave Type Selector -->
                    <div class="component-control-item" style="width: 100%;">
                        <div class="segmented-control" style="margin-bottom: 0px; width: 100%;">
                            <div class="segmented-option ${comp.waveType === 'sine' || !comp.waveType ? 'active' : ''}" onclick="setWaveType('${comp.id}', 'sine')">SINE</div>
                            <div class="segmented-option ${comp.waveType === 'square' ? 'active' : ''}" onclick="setWaveType('${comp.id}', 'square')">SQR</div>
                            <div class="segmented-option ${comp.waveType === 'triangle' ? 'active' : ''}" onclick="setWaveType('${comp.id}', 'triangle')">TRI</div>
                            <div class="segmented-option ${comp.waveType === 'sawtooth' ? 'active' : ''}" onclick="setWaveType('${comp.id}', 'sawtooth')">SAW</div>
                        </div>
                    </div>

                    <!-- Frequency Row -->
                    <div class="component-control-item" style="width: 100%;">
                        <div class="component-slider-wrapper">
                            <span class="component-label">FREQ</span>
                            <input type="range" class="compact-range" value="${comp.freq}" min="0.5" max="50" step="0.5" oninput="updateComponent('${comp.id}', 'freq', this.value)">
                        </div>
                        <div id="f-val-${comp.id}" class="component-value">${comp.freq} Hz</div>
                    </div>
                    <!-- Amp & Phase Row -->
                    <div style="display: flex; gap: 12px;">
                        <div class="component-control-item" style="flex: 1;">
                            <div class="component-slider-wrapper">
                                <span class="component-label">AMP</span>
                                <input type="range" class="compact-range" value="${comp.amp}" min="0" max="2" step="0.1" oninput="updateComponent('${comp.id}', 'amp', this.value)">
                            </div>
                            <div id="a-val-${comp.id}" class="component-value">${comp.amp}</div>
                        </div>
                        <div class="component-control-item" style="flex: 1;">
                            <div class="component-slider-wrapper">
                                <span class="component-label">PHASE</span>
                                <input type="range" class="compact-range" value="${comp.phase || 0}" min="0" max="${(2 * Math.PI).toFixed(4)}" step="${pf.toFixed(4)}" oninput="updateComponent('${comp.id}', 'phase', this.value)">
                            </div>
                            <div id="p-val-${comp.id}" class="component-value">${(comp.phase || 0).toFixed(2)} rad</div>
                        </div>
                    </div>
                </div>
                <div class="component-preview-wrapper"><canvas id="preview-${comp.id}" width="100" height="28"></canvas></div>
                <div style="margin-top: 8px;">
                    <div class="component-label" id="time-label-${comp.id}">TIME (${comp.startTime.toFixed(2)}s - ${comp.endTime.toFixed(2)}s)</div>
                    <div class="double-slider-wrapper">
                        <div class="double-slider-track"></div>
                        <div class="double-slider-fill" style="left: ${(comp.startTime / 5.0) * 100}%; width: ${((comp.endTime - comp.startTime) / 5.0) * 100}%"></div>
                        <input type="range" class="double-slider-input" min="0" max="5" step="0.1" value="${comp.startTime}" oninput="updateTimeConstraint('${comp.id}', 'start', this.value)">
                        <input type="range" class="double-slider-input" min="0" max="5" step="0.1" value="${comp.endTime}" oninput="updateTimeConstraint('${comp.id}', 'end', this.value)">
                    </div>
                </div>
                <div class="envelope-section">
                    <div class="envelope-header">
                        <span class="component-label">ENVELOPE</span>
                        <div class="segmented-control envelope-type-control">
                            <div class="segmented-option ${comp.envelopeType === 'gaussian' ? 'active' : ''}" onclick="setEnvelopeType('${comp.id}', 'gaussian')">GAUSS</div>
                            <div class="segmented-option ${comp.envelopeType === 'adsr' ? 'active' : ''}" onclick="setEnvelopeType('${comp.id}', 'adsr')">ADSR</div>
                            <div class="segmented-option ${comp.envelopeType === 'square' ? 'active' : ''}" onclick="setEnvelopeType('${comp.id}', 'square')">SQR</div>
                        </div>
                    </div>
                    <canvas class="envelope-preview" id="env-prev-${comp.id}" width="200" height="80"></canvas>
                    <div class="envelope-params">${getEnvelopeControls(comp)}</div>
                </div>
            </div>`}`;
        elements.componentsContainer.appendChild(el);
        if (comp.collapsed) {
             drawCollapsedPreview(document.getElementById(`col-prev-${comp.id}`), comp);
        } else {
            drawComponentPreview(document.getElementById(`preview-${comp.id}`), comp);
            drawEnvelopePreview(document.getElementById(`env-prev-${comp.id}`), comp);
            drawCollapsedPreview(document.getElementById(`exp-col-prev-${comp.id}`), comp);
        }
    });
}

function getEnvelopeControls(comp) {
    if (comp.envelopeType === 'gaussian') {
        const p = comp.envelopeParams.gaussian;
        return `<div class="param-col span-2"><input type="range" min="0" max="1" step="0.01" value="${p.center}" oninput="updateEnvParam('${comp.id}', 'gaussian', 'center', this.value)"><span class="param-label">CENTER</span></div><div class="param-col span-2"><input type="range" min="0.05" max="0.5" step="0.01" value="${p.width}" oninput="updateEnvParam('${comp.id}', 'gaussian', 'width', this.value)"><span class="param-label">WIDTH</span></div>`;
    } else if (comp.envelopeType === 'adsr') {
        const p = comp.envelopeParams.adsr;
        return `<div class="param-col"><input type="range" min="0" max="1" step="0.01" value="${p.a}" oninput="updateEnvParam('${comp.id}', 'adsr', 'a', this.value)"><span class="param-label">A</span></div><div class="param-col"><input type="range" min="0" max="1" step="0.01" value="${p.d}" oninput="updateEnvParam('${comp.id}', 'adsr', 'd', this.value)"><span class="param-label">D</span></div> <div class="param-col"><input type="range" min="0" max="1" step="0.01" value="${p.s}" oninput="updateEnvParam('${comp.id}', 'adsr', 's', this.value)"><span class="param-label">S</span></div><div class="param-col"><input type="range" min="0" max="1" step="0.01" value="${p.r}" oninput="updateEnvParam('${comp.id}', 'adsr', 'r', this.value)"><span class="param-label">R</span></div>`;
    } else {
        return `<div class="param-col" style="grid-column: span 4; text-align: center;"><span class="param-label">SQUARE ENVELOPE (FULL AMPLITUDE)</span></div>`;
    }
}

// ----------------------------------------------------
// MATH & GENERATION
// ----------------------------------------------------

function getWaveValue(t, freq, phase, type) {
    const angle = 2 * Math.PI * freq * t + phase;
    switch (type) {
        case 'square':
            return Math.sign(Math.cos(angle));
        case 'triangle':
            return (2 / Math.PI) * Math.asin(Math.cos(angle));
        case 'sawtooth':
            const normAngle = (freq * t + phase / (2 * Math.PI));
            return 2 * (normAngle - Math.floor(normAngle + 0.5));
        case 'sine':
        default:
            return Math.cos(angle);
    }
}

function getEnvelopeValue(tNorm, type, params) {
    if (type === 'gaussian') {
        const p = params.gaussian;
        const num = Math.pow(tNorm - p.center, 2);
        const den = 2 * Math.pow(p.width, 2);
        return Math.exp(-num / den);
    } else if (type === 'square') {
        return 1.0;
    } else {
        const p = params.adsr;
        const t = tNorm;
        if (t < p.a) return t / p.a;
        else if (t < p.a + p.d) return 1 - ((t - p.a) / p.d) * (1 - p.s);
        else if (t < 1.0 - p.r) return p.s;
        else return Math.max(0, p.s * (1 - ((t - (1.0 - p.r)) / p.r)));
    }
}

function getSignalValueAt(t) {
    let val = 0;
    state.components.forEach(comp => {
        if (t < comp.startTime || t > comp.endTime) return;
        const duration = comp.endTime - comp.startTime;
        let ampOffset = 1;
        if (duration > 0.01) {
            const tNorm = (t - comp.startTime) / duration;
            ampOffset = getEnvelopeValue(tNorm, comp.envelopeType, comp.envelopeParams);
        }
        val += comp.amp * getWaveValue(t, comp.freq, comp.phase || 0, comp.waveType || 'sine') * ampOffset;
    });
    return val * state.ampMultiplier;
}

// Standard FFT (based on Fourier3D logic)
let fftBitRev = new Uint32Array(16384);
let fftBitRevN = 0;

// FFT Function (Extended for Inverse)
function fft(data, bufferLike, len, inverse=false) {
    const N = len || data.length;

    // Bit Rev Table (Ensure size)
    if (N > fftBitRev.length || N !== fftBitRevN) {
        fftBitRevN = N;
        fftBitRev = new Uint32Array(N);
        const bits = Math.log2(N);
        for (let i = 0; i < N; i++) {
            let n = i;
            let r = 0;
            for (let b = 0; b < bits; b++) {
                r = (r << 1) | (n & 1);
                n >>= 1;
            }
            fftBitRev[i] = r;
        }
    }

    let output;
    if (bufferLike) output = bufferLike;
    else output = new Array(N);

    // Initial Reordering
    for (let i = 0; i < N; i++) {
        const rev = fftBitRev[i];
        const d = data[rev];
        if (!d) {
             if (bufferLike) { output[i].re = 0; output[i].im = 0; }
             else output[i] = {re:0, im:0};
             continue;
        }
        if (bufferLike) {
            output[i].re = d.re;
            output[i].im = d.im;
        } else {
            output[i] = { re: d.re, im: d.im };
        }
    }

    // Butterfly
    const sign = inverse ? 1 : -1;
    for (let len = 2; len <= N; len <<= 1) {
        const half = len >> 1;
        const angleBase = sign * 2 * Math.PI / len;
        const wBaseRe = Math.cos(angleBase);
        const wBaseIm = Math.sin(angleBase);

        for (let i = 0; i < N; i += len) {
            let wRe = 1;
            let wIm = 0;
            for (let j = 0; j < half; j++) {
                const u = output[i + j];
                const v = output[i + j + half];
                const tRe = wRe * v.re - wIm * v.im;
                const tIm = wRe * v.im + wIm * v.re;
                v.re = u.re - tRe;
                v.im = u.im - tIm;
                u.re = u.re + tRe;
                u.im = u.im + tIm;
                const nextWRe = wRe * wBaseRe - wIm * wBaseIm;
                const nextWIm = wRe * wBaseIm + wIm * wBaseRe;
                wRe = nextWRe;
                wIm = nextWIm;
            }
        }
    }
    
    if(inverse) {
        for(let i=0; i<N; i++) {
            output[i].re /= N;
            output[i].im /= N;
        }
    }
    
    return output;
}

// Helper: Analytic Signal Computation (Hilber Transform)
// To remove negative frequencies and double positive.
function getAnalyticSignal(signalBuffer, numSamples) {
    // 1. Next Power of 2
    let N = 1; while(N < numSamples) N *= 2;
    // Limit max N for performance?
    if (N < 1024) N = 1024; // Min size
    
    // Prepare input
    const input = new Array(N);
    for(let i=0; i<N; i++) {
        if(i < numSamples) input[i] = { re: signalBuffer[i].val, im: 0 };
        else input[i] = { re: 0, im: 0 };
    }
    const spectrum = fft(input, null, N, false);
    
    // Create Analytic Spectrum:
    // Z[k] = 2*X[k] for 1 to N/2-1
    // Z[0] = X[0]
    // Z[N/2] = X[N/2] (Nyquist)
    // Z[k] = 0 for N/2+1 to N-1
    
    // Modifying in place or new buffer? Use spectrum in place.
    const hN = N/2;
    // k=0 stays same
    for(let k=1; k<hN; k++) {
        spectrum[k].re *= 2;
        spectrum[k].im *= 2;
    }
    // k=hN stays same (Nyquist)
    for(let k=hN+1; k<N; k++) {
        spectrum[k].re = 0;
        spectrum[k].im = 0;
    }
    
    // Inverse FFT
    const analytic = fft(spectrum, null, N, true); // Inverse
    
    return analytic; // Array of {re, im}
}

// ----------------------------------------------------
// ANIMATION & LOOP
// ----------------------------------------------------

function animate() {
    requestAnimationFrame(animate); 
    const dpr = window.devicePixelRatio || 1;
    // Clearing Logic from Fourier3D
    Object.values(elements.canvases).forEach(canvas => {
        if(!canvas) return;
        const rect = canvas.parentElement.getBoundingClientRect();
        const newW = Math.round(rect.width * dpr) + 1;
        const newH = Math.round(rect.height * dpr) + 1;
        if (canvas.width !== newW || canvas.height !== newH) { canvas.width = newW; canvas.height = newH; }
        const ctx = canvas.getContext('2d');
        ctx.resetTransform(); 
        ctx.scale(dpr, dpr); 
        ctx.clearRect(0, 0, rect.width + 1, rect.height + 1);
    });

    const N_Base = 2048;
    let safeSampling = Math.min(Math.max(1, state.fftSampling), 4);
    const multiplier = Math.pow(2, Math.floor(safeSampling) - 1);
    const N_FFT = N_Base * multiplier;

    // Reuse complexSignal buffer 
    const complexSignal = ensureObjectArray(state.buffers.complexSignal, N_Base, () => ({ re: 0, im: 0 }));
    // Reuse displaySignal buffer
    const displaySignal = ensureObjectArray(state.buffers.displaySignal, N_Base, () => ({ t: 0, val: 0 }));
    
    // Fill Signal Data (Time Domain)
    for (let i = 0; i < N_Base; i++) {
        const t = i / state.sampleRate;
        complexSignal[i].re = getSignalValueAt(t);
        complexSignal[i].im = 0;
        
        displaySignal[i].t = t;
        displaySignal[i].val = complexSignal[i].re;
    }
    
    // Zero-fill padding
    if(complexSignal.length > N_Base) {
        for(let i = N_Base; i < complexSignal.length; i++) {
            complexSignal[i].re = 0; complexSignal[i].im = 0;
        }
    }

    // 1. Global FFT
    if (!state.buffers.fftOutput) state.buffers.fftOutput = [];
    const fftOutBuf = ensureObjectArray(state.buffers.fftOutput, N_FFT, () => ({ re: 0, im: 0 }));
    let fftResult = fft(complexSignal, fftOutBuf, N_FFT);

    // 3. Drawing
    // Compute Spectrogram based on Transform Type
    const stftData = computeSpectrogram(displaySignal, state.sampleRate, 5.0);

    // Max Freq for FFT Plot   // Max Freq for FFT Plot
    let maxCompFreq = 0; state.components.forEach(c => { if (c.freq > maxCompFreq) maxCompFreq = c.freq; });
    const strictMaxFreq = Math.max(20, Math.ceil(maxCompFreq * 1.5));
    // Check if slider needs update based on component changes
    const sliderStart = document.getElementById('freq-start-input');
    if(sliderStart && parseFloat(sliderStart.max) !== strictMaxFreq) {
         updateFreqSliderUI();
    }
    
    // Ensure view boundaries are sane
    if(state.viewAbs.endFreq > strictMaxFreq) state.viewAbs.endFreq = strictMaxFreq;
    if(state.viewAbs.startFreq > strictMaxFreq) state.viewAbs.startFreq = Math.max(0, strictMaxFreq - 10);
    
    const maxDisplayFreq = state.viewAbs.endFreq > 0 ? Math.min(state.viewAbs.endFreq, strictMaxFreq) : strictMaxFreq;

    drawSignalPlot(elements.ctx.signal, displaySignal, elements.canvases.signal);
    drawAbsTransform(elements.ctx.absTransform, fftResult, elements.canvases.absTransform, maxDisplayFreq, N_FFT);
    drawSpectrogram(elements.ctx.spectrogram, stftData, elements.canvases.spectrogram, maxDisplayFreq);
}

// ----------------------------------------------------
// TRANSFORMS & SPECTROGRAM COMPUTATION
// ----------------------------------------------------

window.setTransformType = (type) => {
    state.transformType = type;
    updateTransformUI(type);
    saveState();
};

function updateTransformUI(type) {
    // Defaults
    if(elements.windowControlsGroup) elements.windowControlsGroup.style.display = 'flex';
    if(elements.widthControl1) elements.widthControl1.style.display = 'flex';
    if(elements.widthControl2) elements.widthControl2.style.display = 'none';
    if(elements.chirpControl) elements.chirpControl.style.display = 'none';
    if(elements.widthLabel1) elements.widthLabel1.innerText = "Window Width";
    
    let desc = "";

    if(type === 'double_gabor') {
        desc = "Multiplies two Gabor transforms with different window widths. Sharpens joint time-frequency localization.";
        if(elements.widthControl2) elements.widthControl2.style.display = 'block'; // force block/flex
        if(elements.widthLabel1) elements.widthLabel1.innerText = "Window Width 1";
    } else if(type === 'wavelet') {
        desc = "Continuous Wavelet Transform (Approximated). Uses wide windows for low frequencies coverage and narrow for high frequencies.";
        if(elements.widthControl1) elements.widthControl1.style.display = 'none';
        // Keep windowControlsGroup visible
    } else if(type === 'wigner') {
         desc = "Pseudo Wigner-Ville Distribution. Offers high resolution but introduces cross-term interference (ghosts) for multi-component signals.";
         if(elements.windowControlsGroup) elements.windowControlsGroup.style.display = 'none';
    } else if(type === 'chirplet') {
         desc = "Chirplet Transform. Extends Gabor with a chirp parameter to rotate the time-frequency tiling, perfect for sweeping signals.";
         if(elements.chirpControl) elements.chirpControl.style.display = 'block';
    } else {
        desc = "Standard Short-Time Fourier Transform (Gabor). Uses a fixed window size for the entire spectrogram.";
    }
    
    if(elements.transformDesc) elements.transformDesc.innerText = desc;
    drawWindowPreview(); // Updates visibility of 2nd canvas potentially via CSS, but we need to draw it.
}

// Master Compute Function
function computeSpectrogram(signalBuffer, sampleRate, duration) {
    if(!signalBuffer || signalBuffer.length === 0) return [];
    
    switch(state.transformType) {
        case 'double_gabor':
            return computeDoubleGabor(signalBuffer, sampleRate, duration);
        case 'wavelet':
            return computeWavelet(signalBuffer, sampleRate, duration);
        case 'wigner':
           return computeWignerVille(signalBuffer, sampleRate, duration);
        case 'chirplet':
           return computeChirplet(signalBuffer, sampleRate, duration);
        case 'gabor':
        default:
            return computeGabor(signalBuffer, sampleRate, duration);
    }
}

// 1. Standard Gabor (STFT)
// Refactored from previous computeSTFT
function computeGabor(signalBuffer, sampleRate, duration, customWidth, customChirp) {
    const numCols = state.stftTimeRes || 200;
    const N_FFT = state.stftFreqRes || 256;
    const stftData = [];
    
    const wWidthSeconds = customWidth !== undefined ? customWidth : state.windowWidth;
    let wSamples = Math.floor(wWidthSeconds * sampleRate);
    if(wSamples % 2 === 0) wSamples++; // force odd for centering

    // Precompute Window
    const winFunc = new Float32Array(wSamples);
    const complexWindow = (customChirp && customChirp !== 0);
    const winFuncIm = complexWindow ? new Float32Array(wSamples) : null;
    
    const center = Math.floor(wSamples / 2);

    if(state.windowType === 'square' && !complexWindow) {
        winFunc.fill(1.0);
    } else {
        // Gaussian base
        // If square selected with chirp, we just use square * chirp
        const isGauss = (state.windowType === 'gaussian');
        const sigma = wSamples / 6; 
        
        for(let i=0; i<wSamples; i++) {
            const x = i - center; // Time relative to center in samples
            const t = x / sampleRate; // Time in seconds
            
            let val = 1.0;
            if(isGauss) val = Math.exp(-(x*x)/(2*sigma*sigma));
            
            if(complexWindow) {
                // Chirp: exp( j * rate * t^2 )
                // rate is Hz/s? Or generic rate. 
                // state.chirpRate is roughly -50 to 50.
                // Let's scale it to be meaningful.
                // Phase phi = k * t^2. Freq = dphi/dt = 2kt.
                // If rate=50 means 50Hz sweep over 1s?
                // Scale factor: chirpRate * 100 * PI ?
                const phase = state.chirpRate * 500 * t * t;
                winFunc[i] = val * Math.cos(phase);
                winFuncIm[i] = val * Math.sin(phase);
            } else {
                winFunc[i] = val;
            }
        }
    }

    const numSamples = Math.floor(duration * sampleRate);
    const stepSize = numSamples / numCols;
    
    // Buffers
    if(!state.buffers.stftInput || state.buffers.stftInput.length < N_FFT) state.buffers.stftInput = [];
    if(!state.buffers.stftOutput || state.buffers.stftOutput.length < N_FFT) state.buffers.stftOutput = [];
    const stftInput = ensureObjectArray(state.buffers.stftInput, N_FFT, ()=>({re:0, im:0}));
    const stftOutput = ensureObjectArray(state.buffers.stftOutput, N_FFT, ()=>({re:0, im:0}));

    for(let t=0; t<numCols; t++) {
        const centerIdx = Math.floor(t * stepSize);
        const startIdx = centerIdx - center;
        
        // Reset Input
        for(let i=0; i<N_FFT; i++) { stftInput[i].re = 0; stftInput[i].im = 0; }
        
        // Windowing
        const copyLen = Math.min(N_FFT, wSamples);
        // Center window in FFT buffer? Or start at 0?
        // Ideally center window at 0 (circular shift), but standard mag spectrogram doesn't care about phase shift much.
        // Simple copy to 0.
        
        for(let i=0; i<copyLen; i++) {
            const sigIdx = startIdx + i;
            if(sigIdx >= 0 && sigIdx < numSamples && sigIdx < signalBuffer.length) {
                const sVal = signalBuffer[sigIdx].val;
                if(complexWindow) {
                    // (sig * (wr + j*wi)) = sig*wr + j*sig*wi
                    stftInput[i].re = sVal * winFunc[i];
                    stftInput[i].im = sVal * winFuncIm[i];
                } else {
                    stftInput[i].re = sVal * winFunc[i];
                }
            }
        }
        
        fft(stftInput, stftOutput, N_FFT);

        const mag = new Float32Array(N_FFT/2);
        for(let k=0; k<N_FFT/2; k++) {
            const r = stftOutput[k].re;
            const im = stftOutput[k].im;
            mag[k] = Math.sqrt(r*r + im*im);
        }
        stftData.push(mag);
    }
    return stftData;
}

// 2. Double Gabor
// Compute Gabor(w1) and Gabor(w2), then multiply magnitudes
function computeDoubleGabor(signalBuffer, sampleRate, duration) {
    const d1 = computeGabor(signalBuffer, sampleRate, duration, state.windowWidth);
    const d2 = computeGabor(signalBuffer, sampleRate, duration, state.windowWidth2);
    
    const numCols = d1.length;
    if(numCols === 0) return [];
    const numRows = d1[0].length;
    
    // Result in d1
    for(let i=0; i<numCols; i++) {
        for(let j=0; j<numRows; j++) {
            // Geometric mean or just product? 
            // Product makes it very sharp (like joint distribution).
            // Normalize?
            // Let's take sqrt(d1 * d2) to keep units roughly same linear amplitude
            d1[i][j] = Math.sqrt(d1[i][j] * d2[i][j]);
        }
    }
    return d1;
}

// 3. Chirplet
function computeChirplet(signalBuffer, sampleRate, duration) {
    // Just Gabor with chirp param
    return computeGabor(signalBuffer, sampleRate, duration, state.windowWidth, state.chirpRate);
}

// 4. Wavelet (Simulated via STFT with Freq-Dependent Window)
// "True" CWT would iterate scales. We want to map to Linear Grid N_FFT.
// We can approximate this by summing Gabor transforms of different widths? No that's slow.
// We can do a Gabor Transform but adaptively smear?
// Correct CWT approach on Grid:
// For each frequency bin f_k (linear grid):
//   Compute CWT coefficient at scale a = f0/f_k.
//   This is a convolution of signal with Wavelet(scale a).
//   We can do this via FFT convolution for specific scales.
// BUT doing this for 256 or 512 linear bins is VERY slow (512 FFTs).
// Optimization: STFT is just a filterbank with Constant Bandwidth.
// CWT is Constant Q.
// Let's fake it nicely or implementing a "Fast CWT" for visualization?
// Or we implement a proper CWT on a Log frequency grid, then interpolate to Linear?
// Actually we can implement the "Wavelet" display as simply:
// Just run 3 STFTs (Wide, Medium, Narrow) and blend them based on Frequency?
// Low Freqs -> Use Wide Window STFT data.
// High Freqs -> Use Narrow Window STFT data.
// Phase matching issues...
// Let's try the Blending Approach:
// STFT_Wide (Window 0.5s)
// STFT_Narrow (Window 0.05s)
// Result[f] = blend(STFT_Wide[f], STFT_Narrow[f], factor(f))
// This provides the visual benefit of multiresolution without O(N^2) cost.

function computeWavelet(signalBuffer, sampleRate, duration) {
    // Multiresolution approximation
    // Compute Low Res (Wide Window) for Low Freqs
    // Compute High Res (Narrow Window) for High Freqs
    
    const wWide = 0.5; // Good for low freqs
    const wNarrow = 0.05; // Good for high freqs
    
    const dWide = computeGabor(signalBuffer, sampleRate, duration, wWide);
    const dNarrow = computeGabor(signalBuffer, sampleRate, duration, wNarrow);
    
    const numCols = dWide.length;
    if(numCols === 0) return [];
    const numRows = dWide[0].length; // N_FFT / 2
    
    // Nyquist = sampleRate / 2.
    // Row k corresponds to f = k * (Fs / N_FFT).
    // Blend Factor. 
    // Low Freqs (k small) -> Use Wide.
    // High Freqs (k large) -> Use Narrow.
    
    for(let i=0; i<numCols; i++) {
        for(let k=0; k<numRows; k++) {
            // Simple linear blend or sigmoid?
            // Midpoint where we switch? e.g. 100Hz?
            // Let's say we transition over the spectrum.
            const ratio = k / numRows; 
            // Bias towards Wide for bottom (lower k)
            // Bias towards Narrow for top (higher k)
            // Let's use sqrt interp to be smooth
            const alpha = Math.sqrt(ratio); // 0 at DC, 1 at Nyquist
            
            dWide[i][k] = (1-alpha)*dWide[i][k] + alpha*dNarrow[i][k];
        }
    }
    return dWide;
}


// 5. Smoothed Pseudo Wigner-Ville
// SPWVD(t, f) = Integral( h(tau) * Integral( g(u-t) * x(u+tau/2) * x*(u-tau/2) du ) * exp(-j2pi f tau) dtau )
// Simplified Pseudo Wigner Ville (no frequency smoothing g(u)=delta):
// PWVD(t, f) = Integral( h(tau) * x(t+tau/2) * x*(t-tau/2) * exp(-j...) )
// Ideally we need analytic signal to avoid interference terms at DC/Nyquist (aliasing).
// Analytic Signal x_a = x + jH(x).
function computeWignerVille(signalBuffer, sampleRate, duration) {
    // 1. Compute Analytic Signal (Approximation or via Global FFT)
    // Global FFT approach is best if we have the full buffer.
    const numSamples = Math.floor(duration * sampleRate);
    
    // Compute Analytic Signal z(t) = x(t) + jH[x(t)]
    // This removes cross terms between positive and negative frequencies.
    const z = getAnalyticSignal(signalBuffer, numSamples);
    
    // Only compute if we have a buffer
    // For performance, maybe skip analytic and just use real? 
    // Real WVD has cross terms between +f and -f (at DC). 
    // Let's try Real first for speed. If cross terms are bad, we'll fix.
    
    const numCols = state.stftTimeRes || 200;
    const N_FFT = state.stftFreqRes || 256;
    const stftData = [];
    
    // Window h(tau)
    const wWidthSeconds = state.windowWidth;
    let wSamples = Math.floor(wWidthSeconds * sampleRate); 
    if(wSamples % 2 === 0) wSamples++;
    const halfW = Math.floor(wSamples/2);
    
    // Precompute Window
    const winFunc = new Float32Array(wSamples);
    const sigma = wSamples / 6;
    for(let i=0; i<wSamples; i++) {
         const x = i - halfW;
         winFunc[i] = Math.exp(-(x*x)/(2*sigma*sigma)); // Gaussian window
    }

    const stepSize = numSamples / numCols;
    
    const stftInput = ensureObjectArray(state.buffers.stftInput, N_FFT, ()=>({re:0, im:0}));
    const stftOutput = ensureObjectArray(state.buffers.stftOutput, N_FFT, ()=>({re:0, im:0}));

    for(let t=0; t<numCols; t++) {
        const centerIdx = Math.floor(t * stepSize);
        
        // Compute Auto-Correlation function K[tau]
        // K[tau] = z[t + tau] * z*[t - tau]
        // Range of tau? -halfW to +halfW.
        // We map tau to FFT input.
        
        for(let i=0; i<N_FFT; i++) { stftInput[i].re = 0; stftInput[i].im = 0; }
        
        // We iterate tau. 
        // tau goes from -halfW to halfW.
        // x takes real values.
        
        // N_FFT bins. 
        // Standard WVD def: Discrete WVD often uses 2*tau steps or oversampling?
        // Let's stick to standard k = x(n+m)x*(n-m).
        // m from -M to M.
        
        const M = Math.min(halfW, Math.floor(N_FFT/2) - 1);
        
        // Center term (m=0)
        // z[t] * z*[t] = |z[t]|^2
        if(centerIdx >=0 && centerIdx < numSamples) {
            // const val = signalBuffer[centerIdx].val;
            // stftInput[0].re = val * val * winFunc[halfW]; // m=0 window center
            const z0 = z[centerIdx];
            if(z0) {
               const magSq = z0.re*z0.re + z0.im*z0.im;
               stftInput[0].re = magSq * winFunc[halfW];
            }
        }
        
        for(let m=1; m<=M; m++) {
            const idxP = centerIdx + m;
            const idxN = centerIdx - m;
            
            if(idxP < z.length && idxN >= 0) {
                const zP = z[idxP];
                const zN = z[idxN];
                
                // z(n+m) * z*(n-m)
                // (a+jb)(c-jd) = (ac+bd) + j(bc-ad)
                const ac_bd = zP.re*zN.re + zP.im*zN.im;
                const bc_ad = zP.im*zN.re - zP.re*zN.im;
                
                // Apply smoothing window h(m)
                // Window index: halfW + m and halfW - m?
                // Usually window is applied to the lag m.
                const wVal = winFunc[halfW + m]; // symmetric
                
                const re = ac_bd * wVal;
                const im = bc_ad * wVal;
                
                // Fill symmetric FFT buffer
                // Positive lag m
                stftInput[m].re = re;
                stftInput[m].im = im;
                
                // Negative lag (maps to N - m)
                // K[-tau] = z[t-tau]*z*[t+tau] = (z[t+tau]*z*[t-tau])* = K[tau]*
                // So at N-m we put conjugate of m
                stftInput[N_FFT - m].re = re;
                stftInput[N_FFT - m].im = -im;
            }
        }
        
        fft(stftInput, stftOutput, N_FFT);
        
        const mag = new Float32Array(N_FFT/2);
        
        // Fix scaling: WVD lag step 2 leads to effective Fs_wvd = Fs / 2.
        // So bin k corresponds to freq k * (Fs/2) / N.
        // Standard Spectrogram expects bin j to be freq j * Fs / N.
        // Equating freqs: k * Fs / (2N) = j * Fs / N  => k = 2j.
        // We can only fill up to Fs/4 (j < N/4) with this method.
        
        for(let j=0; j<N_FFT/4; j++) {
             // WVD is real.
             mag[j] = Math.abs(stftOutput[2*j].re); 
        }
        stftData.push(mag);
    }
    return stftData;
}



// ----------------------------------------------------
// PLOTTING UTILS (Exact Copy)
// ----------------------------------------------------

function drawSignalPlot(ctx, data, canvas) {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);

    let maxVal = 0;
    for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i].val);
        if (abs > maxVal) maxVal = abs;
    }
    const bound = Math.max(2, Math.ceil(maxVal * 1.1)); 
    const yRange = [-bound, bound];

    if (state.showAxis) {
        drawAxis(ctx, w, h, [state.zoomStart, state.zoomEnd], yRange, ' s', '');
        const y0 = h / 2;
        ctx.beginPath();
        ctx.strokeStyle = '#eee';
        ctx.lineWidth = 1;
        ctx.moveTo(0, y0);
        ctx.lineTo(w, y0);
        ctx.stroke();
    }

    const timeToX = (t) => ((t - state.zoomStart) / (state.zoomEnd - state.zoomStart)) * w;
    const totalDuration = 5.0; 
    const sampleRate = data.length / totalDuration;

    let startSample = Math.floor(state.zoomStart * sampleRate) - 100;
    let endSample = Math.ceil(state.zoomEnd * sampleRate) + 100;
    startSample = Math.max(0, startSample);
    endSample = Math.min(data.length, endSample);

    let idxStart = startSample;
    const idxEnd = endSample;
    if (idxStart > 0 && data.length > 0) {
        while (idxStart > 0 && timeToX(data[idxStart].t) > 0) idxStart--;
        if (idxStart > 0) idxStart--;
    }

    if (idxEnd > idxStart) {
        ctx.beginPath();
        ctx.strokeStyle = '#1484e6';
        ctx.lineWidth = 1.5;
        const yScale = h / (2 * bound);
        const yCenter = h / 2;

        let first = true;
        for (let i = idxStart; i < idxEnd; i++) {
            const pt = data[i];
            const t = pt.t;
            const x = timeToX(t);
            const y = yCenter - pt.val * yScale;
            if (first) { ctx.moveTo(x, y); first = false; } else { ctx.lineTo(x, y); }
        }
        ctx.stroke();
    }

    if (isPlaying) {
        let t = audioCtx.currentTime - audioStartTime;
        if (t >= state.zoomStart && t <= state.zoomEnd) {
            const x = timeToX(t);
            ctx.beginPath();
            ctx.moveTo(x, 0); ctx.lineTo(x, h);
            ctx.strokeStyle = 'rgba(20, 132, 230, 0.8)'; ctx.lineWidth = 2; ctx.stroke();
        }
    }

    // Selected Time Marker
    const tX = timeToX(state.selectedTime);
    if (tX >= -2 && tX <= w + 2) {
        ctx.beginPath();
        ctx.moveTo(tX, 0);
        ctx.lineTo(tX, h);
        ctx.strokeStyle = '#1484e6';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.stroke();

        ctx.setLineDash([]);
        const val = getSignalValueAt(state.selectedTime);
        const y = h / 2 - val * (h / (2 * bound));
        ctx.beginPath();
        ctx.fillStyle = '#1484e6';
        ctx.arc(tX, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

function drawAbsTransform(ctx, fft, canvas, maxFreq, N_FFT) {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    const startF = state.viewAbs.startFreq;
    const endF = state.viewAbs.endFreq > 0 ? state.viewAbs.endFreq : maxFreq;
    const freqRange = endF - startF;

    let yZero = h;
    let yScale = h * 0.8;

    if (state.showReIm) {
        yZero = h / 2;
        yScale = (h / 2) * 0.8;
        if (state.showAxis) drawAxis(ctx, w, h, [startF, endF], [-1, 1], ' Hz', '');
    } else {
        const yMin = -0.15;
        const yMax = 1.6;
        const ySpan = yMax - yMin;
        yScale = h / ySpan;
        yZero = h + ((yMin) / ySpan) * h; 
        if (state.showAxis) drawAxis(ctx, w, h, [startF, endF], [yMin, yMax], ' Hz', '');
    }

    if (state.showReIm) {
        ctx.beginPath(); ctx.strokeStyle = '#eee';
        ctx.moveTo(0, yZero); ctx.lineTo(w, yZero); ctx.stroke();
    }

    if (parseFloat(freqRange) <= 0.0001) return;

    if (fft && fft.length > 0) {
        const dF = state.sampleRate / N_FFT;
        const maxK = Math.min(Math.ceil(endF / dF), fft.length);
        const startK = Math.floor(startF / dF);
        const N_Base = 2048;

        ctx.lineWidth = 1.5;
        const pts = [];
        const ptsRe = [];
        const ptsIm = [];

        for (let k = startK; k < maxK; k++) {
            const mag = Math.sqrt(fft[k].re ** 2 + fft[k].im ** 2);
            const f = k * dF;
            const x = ((f - startF) / freqRange) * w;

            pts.push({ x, y: yZero - (mag / (N_Base / 2)) * yScale });
            if (state.showReIm) {
                ptsRe.push({ x, y: yZero - (fft[k].re / (N_Base / 2)) * yScale });
                ptsIm.push({ x, y: yZero + (fft[k].im / (N_Base / 2)) * yScale });
            }
        }

        if (state.showReIm) {
            ctx.beginPath(); ctx.strokeStyle = 'rgba(20, 132, 230, 0.4)';
            drawSpline(ctx, ptsRe, state.fftSmoothing); ctx.stroke();
            ctx.beginPath(); ctx.strokeStyle = 'rgba(128, 229, 53, 0.5)';
            drawSpline(ctx, ptsIm, state.fftSmoothing); ctx.stroke();
        }

        if (pts.length > 0) {
            ctx.beginPath(); ctx.strokeStyle = '#000000'; ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            drawSpline(ctx, pts, state.fftSmoothing); ctx.stroke();
        }

        // Selected Freq Marker
        const selX = ((state.selectedFrequency - startF) / freqRange) * w;
        if (selX >= 0 && selX <= w) {
            ctx.beginPath();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.moveTo(selX, 0);
            ctx.lineTo(selX, h);
            ctx.stroke();
            ctx.setLineDash([]);

            const idx = Math.round(state.selectedFrequency / dF);
            const ptIdx = idx - startK;
            let closestY = yZero;
            if (ptIdx >= 0 && ptIdx < pts.length) closestY = pts[ptIdx].y;

            ctx.beginPath();
            ctx.fillStyle = '#000000';
            ctx.arc(selX, closestY, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
}

function drawAxis(ctx, w, h, xRange, yRange, suffixX, suffixY) {
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    ctx.fillStyle = '#888';

    // X-Axis
    for (let i = 0; i <= 5; i++) {
        const t = i / 5;
        const x = t * w;
        if (x < 2 || x > w - 2) continue;

        ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x, h - 5); ctx.stroke();
        const val = xRange[0] + t * (xRange[1] - xRange[0]);
        const text = val.toFixed(1) + (suffixX || '');
        const tw = ctx.measureText(text).width;
        ctx.fillText(text, Math.min(w - tw - 2, Math.max(2, x - tw / 2)), h - 6);
    }
    // Y-Axis
    for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        const y = h - t * h;
        if (y < 8 || y > h - 8) continue;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(5, y); ctx.stroke();
        const val = yRange[0] + t * (yRange[1] - yRange[0]);
        const text = val.toFixed(1) + (suffixY || '');
        ctx.fillText(text, 6, y + 3);
    }
}

function drawSpline(ctx, pts, useSmoothing) {
    if (pts.length < 2) return;
    if (!useSmoothing) {
        for (let i = 0; i < pts.length; i++) {
            if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
            else ctx.lineTo(pts[i].x, pts[i].y);
        }
        return;
    }
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
        const xc = (pts[i].x + pts[i + 1].x) / 2;
        const yc = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}

// ----------------------------------------------------
// PREVIEW UTILS
// ----------------------------------------------------
function drawComponentPreview(canvas, comp) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.beginPath();
    ctx.strokeStyle = '#1484e6';
    ctx.lineWidth = 2;
    ctx.moveTo(0, r.height / 2);
    for (let x = 0; x <= r.width; x++) {
        const t = (x / r.width) * 1.0;
        const val = comp.amp * getWaveValue(t, comp.freq, comp.phase || 0, comp.waveType || 'sine');
        ctx.lineTo(x, r.height / 2 - (val / 2.5) * (r.height / 2));
    }
    ctx.stroke();
}

function drawEnvelopePreview(canvas, comp) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    ctx.scale(dpr, dpr);
    const w = r.width, h = r.height;
    ctx.clearRect(0, 0, w, h);
    
    ctx.beginPath(); ctx.strokeStyle = '#eee'; ctx.moveTo(0, h); ctx.lineTo(w, h); ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(135, 206, 250, 0.4)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x++) {
        const t = x / w;
        const env = getEnvelopeValue(t, comp.envelopeType, comp.envelopeParams);
        const carrier = getWaveValue(t, comp.freq, comp.phase || 0, comp.waveType || 'sine');
        const val = Math.abs(carrier) * env; 
        const y = h - (val * h * 0.9) - 2;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = '#1484e6';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        const val = getEnvelopeValue(t, comp.envelopeType, comp.envelopeParams);
        const x = t * w;
        const y = h - (val * h * 0.9) - 2;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

function drawCollapsedPreview(canvas, comp) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    ctx.scale(dpr, dpr);
    const w = r.width; const h = r.height;
    ctx.clearRect(0, 0, w, h);

    ctx.beginPath(); ctx.strokeStyle = '#1484e6'; ctx.lineWidth = 1.5;
    const MAX = 5.0;
    const yBase = h / 2;
    const yScale = h / 2.5; 
    
    for (let i = 0; i <= w; i++) {
        const t = (i / w) * MAX;
        let val = 0;
        if (t >= comp.startTime && t <= comp.endTime) {
            const duration = comp.endTime - comp.startTime;
            let env = 1;
            if (duration > 0.01) {
                const tNorm = (t - comp.startTime) / duration;
                env = getEnvelopeValue(tNorm, comp.envelopeType, comp.envelopeParams);
            }
            const carrier = getWaveValue(t, comp.freq, comp.phase || 0, comp.waveType || 'sine');
            val = carrier * env * comp.amp;
        }
        const y = yBase - val * yScale;
        if (i === 0) ctx.moveTo(i, y); else ctx.lineTo(i, y);
    }
    ctx.stroke();
}

// ----------------------------------------------------
// SPECTROGRAM DRAWING
// ----------------------------------------------------

function drawSpectrogram(ctx, stftData, canvas, maxFreq) {
    if(!stftData || stftData.length === 0) return;
    
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    
    if(!elements.tempCanvas) elements.tempCanvas = document.createElement('canvas');
    const tw = stftData.length;
    const th = stftData[0].length;
    
    if(elements.tempCanvas.width !== tw || elements.tempCanvas.height !== th) {
        elements.tempCanvas.width = tw;
        elements.tempCanvas.height = th;
    }
    
    const tCtx = elements.tempCanvas.getContext('2d');
    const imgData = tCtx.createImageData(tw, th);
    const d = imgData.data;
    
    for(let x=0; x<tw; x++) {
        const col = stftData[x];
        for(let y=0; y<th; y++) {
            // y is freq bin. 0 is DC. 
            // We want y=0 at bottom. Canvas 0 is top.
            const val = col[y]; 
            const mag = state.spectrogramLogScale ? Math.log10(val + 1) * 2 : val * 0.1;
            const intensity = Math.min(1.0, mag);
            
            const py = th - 1 - y;
            const idx = (py * tw + x) * 4;
            
            d[idx] = 255 - (235 * intensity);
            d[idx+1] = 255 - (123 * intensity);
            d[idx+2] = 255 - (25 * intensity);
            d[idx+3] = 255;
        }
    }
    tCtx.putImageData(imgData, 0, 0);
    
    // Draw scaled
    // Calculate Source Rect based on zoom
    const sx = (state.zoomStart / 5.0) * tw;
    const sw = ((state.zoomEnd - state.zoomStart) / 5.0) * tw;
    
    // Y-Zoom (Frequency)
    // Canvas Top is 0 Hz? NO. 
    // In temp canvas generation: py = th - 1 - y. (y=0 is freq 0).
    // So py=th-1 is freq 0 (Bottom of temp canvas).
    // py=0 is freq Max (Nyquist, Top of temp canvas).
    
    const nyquist = state.sampleRate / 2;
    // Current View Freqs
    const fStart = state.viewAbs.startFreq;
    const fEnd = state.viewAbs.endFreq > 0 ? state.viewAbs.endFreq : maxFreq; 
    
    // Clamp to Nyquist
    const dispStart = Math.min(fStart, nyquist);
    const dispEnd = Math.min(fEnd, nyquist);
    
    // Map Freq to Y pixels in Temp Canvas (Top-Down, 0 at Top)
    // Y_norm = 1.0 - (f / Nyquist). (1.0 is Bottom/DC, 0.0 is Top/Nyq)
    // y_pixel = Y_norm * th.
    
    const yTopNorm = 1.0 - (dispEnd / nyquist);
    const yBotNorm = 1.0 - (dispStart / nyquist);
    
    const sy = yTopNorm * th;
    const sh = (yBotNorm - yTopNorm) * th;
    
    // Prevent invalid source rect
    if(sw <= 0 || sh <= 0) return;

    ctx.imageSmoothingEnabled = true; 
    ctx.drawImage(elements.tempCanvas, sx, sy, sw, sh, 0, 0, w, h);
    
    if(state.showAxis) {
        drawAxis(ctx, w, h, [state.zoomStart, state.zoomEnd], [dispStart, dispEnd], ' s', ' Hz');
    }

    // DRAW OVERLAYS on Spectrogram
    // 1. Time Line (Vertical)
    if(state.selectedTime >= state.zoomStart && state.selectedTime <= state.zoomEnd) {
        const timeX = ((state.selectedTime - state.zoomStart) / (state.zoomEnd - state.zoomStart)) * w;
        ctx.beginPath();
        ctx.strokeStyle = '#1484e6';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.moveTo(timeX, 0);
        ctx.lineTo(timeX, h);
        ctx.stroke();
    }

    // 2. Freq Line (Horizontal)
    // displayMax is top (y=0 in canvas). 0Hz is Bottom (y=h).
    // range 0 to displayMax.
    if(state.selectedFrequency >= 0 && state.selectedFrequency <= displayMax) {
        const freqY = h - (state.selectedFrequency / displayMax) * h;
        ctx.beginPath();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.moveTo(0, freqY);
        ctx.lineTo(w, freqY);
        ctx.stroke();

        // 3. Intersection
        if(state.selectedTime >= state.zoomStart && state.selectedTime <= state.zoomEnd) {
            const timeX = ((state.selectedTime - state.zoomStart) / (state.zoomEnd - state.zoomStart)) * w;
            ctx.setLineDash([]);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.strokeStyle = '#fff';
            ctx.arc(timeX, freqY, 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.fillStyle = '#000000';
            ctx.arc(timeX, freqY, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}


// ----------------------------------------------------
// UI HELPERS
// ----------------------------------------------------

function updateSignalSliderUI() {
    const startInput = document.getElementById('display-start-input');
    const endInput = document.getElementById('display-end-input');
    if (startInput && endInput) {
        startInput.value = state.zoomStart;
        endInput.value = state.zoomEnd;
        const fill = document.getElementById('display-segment-fill');
        if (fill) {
            fill.style.left = (state.zoomStart / 5) * 100 + '%';
            fill.style.width = ((state.zoomEnd - state.zoomStart) / 5) * 100 + '%';
        }
        const label = document.getElementById('display-segment-label');
        if (label) label.innerText = `Displayed time (${state.zoomStart.toFixed(2)}s - ${state.zoomEnd.toFixed(2)}s)`;
    }
}

window.updateDisplaySegment = (type, val) => {
    val = parseFloat(val);
    if (type === 'start') { if (val >= state.zoomEnd) state.zoomEnd = Math.min(val + 0.1, 5); state.zoomStart = val; }
    else { if (val <= state.zoomStart) state.zoomStart = Math.max(val - 0.1, 0); state.zoomEnd = val; }
    updateSignalSliderUI();
    saveState();
};

function updateFreqSliderUI() {
    let maxCompFreq = 0; state.components.forEach(c => { if (c.freq > maxCompFreq) maxCompFreq = c.freq; });
    const maxLimit = Math.max(20, Math.ceil(maxCompFreq * 1.5));

    const sliderStart = document.getElementById('freq-start-input');
    const sliderEnd = document.getElementById('freq-end-input');

    if (sliderStart && sliderEnd) {
        if (sliderStart.max != maxLimit) { sliderStart.max = maxLimit; sliderEnd.max = maxLimit; }
        // Ensure values are clamped
        if (state.viewAbs.startFreq > maxLimit) state.viewAbs.startFreq = maxLimit;
        if (state.viewAbs.endFreq > maxLimit && state.viewAbs.endFreq !== 0) state.viewAbs.endFreq = maxLimit;

        sliderStart.value = state.viewAbs.startFreq;
        sliderEnd.value = state.viewAbs.endFreq === 0 ? 0 : state.viewAbs.endFreq;

        const fill = document.getElementById('freq-segment-fill');
        const displayEnd = state.viewAbs.endFreq === 0 ? maxLimit : state.viewAbs.endFreq;
        if (fill) {
            fill.style.left = (state.viewAbs.startFreq / maxLimit) * 100 + '%';
            fill.style.width = ((displayEnd - state.viewAbs.startFreq) / maxLimit) * 100 + '%';
        }
        const label = document.getElementById('freq-segment-label');
        if (label) label.innerText = `Displayed frequencies (${state.viewAbs.startFreq.toFixed(1)}Hz - ${state.viewAbs.endFreq === 0 ? 'Auto' : state.viewAbs.endFreq.toFixed(1) + 'Hz'})`;
    }
}

window.updateFreqSegment = (type, val) => {
    val = parseFloat(val);
    if (type === 'start') {
        if (state.viewAbs.endFreq !== 0 && val >= state.viewAbs.endFreq) state.viewAbs.endFreq = val + 1;
        state.viewAbs.startFreq = val;
    } else {
        if (state.viewAbs.endFreq === 0) { state.viewAbs.startFreq = 0; }
        if (val <= state.viewAbs.startFreq) state.viewAbs.startFreq = Math.max(val - 1, 0);
        state.viewAbs.endFreq = val;
    }
    updateFreqSliderUI();
    saveState();
};

function setupListeners() {
    // Window Width
    if(elements.windowWidthSlider) {
        elements.windowWidthSlider.addEventListener('input', (e) => {
           state.windowWidth = parseFloat(e.target.value);
           elements.windowWidthDisplay.innerText = state.windowWidth.toFixed(2) + 's';
           drawWindowPreview();
           saveState();
        });
    }

    if(elements.stftTimeResSlider) {
        elements.stftTimeResSlider.addEventListener('input', (e) => {
            state.stftTimeRes = parseInt(e.target.value);
            elements.stftTimeResDisplay.innerText = state.stftTimeRes;
            saveState();
        });
    }

    if(elements.windowWidth2Slider) {
        elements.windowWidth2Slider.addEventListener('input', (e) => {
            state.windowWidth2 = parseFloat(e.target.value);
            elements.windowWidth2Display.innerText = state.windowWidth2.toFixed(2) + 's';
            drawWindowPreview(); // Redraws both
            saveState();
        });
    }

    if(elements.chirpRateSlider) {
        elements.chirpRateSlider.addEventListener('input', (e) => {
            state.chirpRate = parseFloat(e.target.value);
            elements.chirpRateDisplay.innerText = state.chirpRate;
            saveState();
        });
    }

    elements.addComponentBtn.addEventListener('click', () => {
        state.components.push(new SignalComponent(1, 1.0));
        renderComponentsUI();
        saveState();
    });

    elements.resetBtn.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
    });
    
    if (elements.hardReloadBtn) {
        elements.hardReloadBtn.addEventListener('click', () => {
            localStorage.clear();
            location.reload(true);
        });
    }
    
    // Collapsible
    document.querySelectorAll('.section-header-collapsible').forEach(header => {
        header.addEventListener('click', () => {
            const target = document.getElementById(header.getAttribute('data-target'));
            if (target) {
                target.classList.toggle('expanded');
                const icon = header.querySelector('.dropdown-icon');
                if (icon) icon.classList.toggle('collapsed', !target.classList.contains('expanded'));
            }
        });
    });
    
    // Audio
    elements.audioMultSlider.addEventListener('input', (e) => {
        state.audioMultiplier = parseInt(e.target.value);
        elements.audioMultDisplay.innerText = state.audioMultiplier;
        saveState();
    });
    
     const volSlider = document.getElementById('master-vol-slider');
    if (volSlider) {
        volSlider.addEventListener('input', (e) => {
             state.masterVolume = parseFloat(e.target.value);
             const disp = document.getElementById('master-vol-display');
             if(disp) disp.textContent = state.masterVolume;
             saveState();
        });
    }

    elements.axisToggle.addEventListener('change', (e) => {
        state.showAxis = e.target.checked;
        saveState();
    });
    
    if(elements.reimToggle) {
        elements.reimToggle.addEventListener('change', (e) => {
            state.showReIm = e.target.checked;
            saveState();
        });
    }
    
    if (elements.fftSamplingSlider) {
        elements.fftSamplingSlider.addEventListener('input', (e) => {
            state.fftSampling = parseFloat(e.target.value);
            saveState();
        });
    }

    if (elements.fftSmoothingToggle) {
        elements.fftSmoothingToggle.addEventListener('change', (e) => {
            state.fftSmoothing = e.target.checked;
            saveState();
        });
    }
    
    // Abs Plot Drag Interaction
    const absCanvas = elements.canvases.absTransform;
    if(absCanvas) {
        const handleFreqDrag = (e) => {
             const rect = absCanvas.getBoundingClientRect();
             const w = rect.width;
             const x = e.clientX - rect.left;

             let maxCompFreq = 0;
             state.components.forEach(c => { if (c.freq > maxCompFreq) maxCompFreq = c.freq; });
             const strictMax = Math.max(20, Math.ceil(maxCompFreq * 1.5));
             // Calculate max display freq currently
             const maxDisplay = state.viewAbs.endFreq > 0 ? state.viewAbs.endFreq : strictMax;
             const startF = state.viewAbs.startFreq;
             
             if(state.viewAbs.isPanning) {
                 const dx = e.clientX - state.lastMouse.x;
                 const range = maxDisplay - startF;
                 const shift = -(dx / w) * range;
                 
                 let newStart = state.viewAbs.startFreq + shift;
                 let newEnd = (state.viewAbs.endFreq === 0 ? strictMax : state.viewAbs.endFreq) + shift;
                 
                 // Clamp
                 if(newStart < 0) {
                     const d = 0 - newStart;
                     newStart += d; newEnd += d;
                 }
                 if(newEnd > strictMax) {
                     const d = newEnd - strictMax;
                     newStart -= d; newEnd -= d;
                     if(newStart < 0) newStart = 0;
                 }
                 
                 state.viewAbs.startFreq = newStart;
                 state.viewAbs.endFreq = newEnd;
                 updateFreqSliderUI();
             } else {
                 // Select Freq: Range is startF to maxDisplay
                 // maxDisplay here is effectively endF from drawing
                 const f = startF + (x / w) * (maxDisplay - startF);
                 state.selectedFrequency = Math.max(startF, Math.min(f, maxDisplay));
                 if(elements.plotInfo) elements.plotInfo.innerText = `Freq: ${state.selectedFrequency.toFixed(2)} Hz`;
             }
             state.lastMouse = { x: e.clientX, y: e.clientY };
             saveState();
        };

        absCanvas.addEventListener('pointerdown', (e) => {
            absCanvas.setPointerCapture(e.pointerId);
            if (e.ctrlKey) {
                state.viewAbs.isPanning = true;
                state.lastMouse = { x: e.clientX, y: e.clientY };
            } else {
                handleFreqDrag(e);
            }
        });
        absCanvas.addEventListener('pointermove', (e) => {
             if (e.ctrlKey) absCanvas.style.cursor = 'grab';
             else absCanvas.style.cursor = 'col-resize';
             
             if(state.viewAbs.isPanning || e.buttons === 1) {
                 handleFreqDrag(e);
             }
        });
        absCanvas.addEventListener('wheel', (e) => {
             if(e.ctrlKey) {
                 e.preventDefault();
                 const rect = absCanvas.getBoundingClientRect();
                 const w = rect.width;
                 const x = e.clientX - rect.left;
                 
                 let maxCompFreq = 0;
                 state.components.forEach(c => { if (c.freq > maxCompFreq) maxCompFreq = c.freq; });
                 const strictMax = Math.max(20, Math.ceil(maxCompFreq * 1.5));
                 const currentEnd = state.viewAbs.endFreq > 0 ? state.viewAbs.endFreq : strictMax;
                 const currentStart = state.viewAbs.startFreq;
                 
                 const fFocus = currentStart + (x/w)*(currentEnd - currentStart);
                 const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
                 const newRange = (currentEnd - currentStart) * zoomFactor;
                 
                 let newStart = fFocus - (fFocus - currentStart) * zoomFactor;
                 let newEnd = newStart + newRange;
                 
                 if(newStart < 0) newStart = 0;
                 if(newEnd > strictMax) {
                     const d = newEnd - strictMax; newStart -= d; newEnd -= d;
                     if(newStart < 0) newStart = 0;
                 }
                 state.viewAbs.startFreq = newStart;
                 state.viewAbs.endFreq = newEnd;
                 updateFreqSliderUI();
                 saveState();
             }
        }, {passive: false});

        absCanvas.addEventListener('pointerup', (e) => {
            state.viewAbs.isPanning = false;
            absCanvas.releasePointerCapture(e.pointerId);
        });
    }

    // Signal Plot Interactions (Zoom/Pan/Select)
    const sigCanvas = elements.canvases.signal;
    if(sigCanvas) {
         const handleSigDrag = (e) => {
             const rect = sigCanvas.getBoundingClientRect();
             const w = rect.width;
             const x = e.clientX - rect.left;
             
             if(state.isPanningSignal) {
                 const dx = e.clientX - state.lastMouse.x;
                 const tr = state.zoomEnd - state.zoomStart;
                 const shift = -(dx/w)*tr;
                 state.zoomStart = Math.max(0, state.zoomStart + shift);
                 state.zoomEnd = Math.min(5.0, state.zoomStart + tr);
                 if(state.zoomStart < 0) state.zoomStart = 0;
                 if(state.zoomEnd > 5.0) state.zoomEnd = 5.0;
                 if(state.zoomStart > state.zoomEnd - 0.01) state.zoomStart = state.zoomEnd - 0.01;
                 updateSignalSliderUI();
             } else {
                 const t = state.zoomStart + (x/w)*(state.zoomEnd - state.zoomStart);
                 state.selectedTime = Math.max(state.zoomStart, Math.min(t, state.zoomEnd));
                 if(elements.timeInfo) elements.timeInfo.innerText = `Time: ${state.selectedTime.toFixed(2)}s`;
             }
             state.lastMouse = { x: e.clientX, y: e.clientY };
             saveState();
         };

         sigCanvas.addEventListener('pointerdown', (e) => {
             sigCanvas.setPointerCapture(e.pointerId);
             if(e.ctrlKey) {
                 state.isPanningSignal = true;
                 state.lastMouse = { x: e.clientX, y: e.clientY };
             } else {
                 handleSigDrag(e);
             }
         });
         sigCanvas.addEventListener('pointermove', (e) => {
             if(e.ctrlKey) sigCanvas.style.cursor = 'grab';
             else sigCanvas.style.cursor = 'col-resize';
             
             if(state.isPanningSignal || e.buttons === 1) {
                 handleSigDrag(e);
             }
         });
         sigCanvas.addEventListener('wheel', (e) => {
             if(e.ctrlKey) {
                 e.preventDefault();
                 const rect = sigCanvas.getBoundingClientRect();
                 const w = rect.width;
                 const x = e.clientX - rect.left;
                 
                 const tFocus = state.zoomStart + (x/w)*(state.zoomEnd - state.zoomStart);
                 const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
                 const newRange = (state.zoomEnd - state.zoomStart) * zoomFactor;
                 
                 state.zoomStart = Math.max(0, tFocus - (tFocus - state.zoomStart) * zoomFactor);
                 state.zoomEnd = Math.min(5.0, state.zoomStart + newRange);
                 
                 updateSignalSliderUI();
                 saveState();
             }
         }, {passive: false});

         sigCanvas.addEventListener('pointerup', (e) => {
             state.isPanningSignal = false;
             sigCanvas.releasePointerCapture(e.pointerId);
         });
    }

    // Spectrogram Interaction
    const specCanvas = elements.canvases.spectrogram;
    if(specCanvas) {
        const handleSpecDrag = (e) => {
             const rect = specCanvas.getBoundingClientRect();
             const w = rect.width;
             const h = rect.height;
             const x = e.clientX - rect.left;
             const y = e.clientY - rect.top;
             
             // X -> Time
             // range: state.zoomStart to state.zoomEnd
             const t = state.zoomStart + (x/w)*(state.zoomEnd - state.zoomStart);
             state.selectedTime = Math.max(state.zoomStart, Math.min(t, state.zoomEnd));
             if(elements.timeInfo) elements.timeInfo.innerText = `Time: ${state.selectedTime.toFixed(2)}s`;

             // Y -> Freq
             // Y=0 -> displayMax, Y=h -> 0Hz ? 
             // In drawSpectrogram:
             // displayMax = Math.min(maxFreq, nyquist).
             // ctx.drawImage(..., 0, 0, w, h). 
             // But drawImage draws the source sub-rect.
             // Source rect: sy = th - sh (High Freq to Low Freq? No).
             // tCtx logic: y=0 (bin 0) is drawn at index corresponding to py=th-1 (Bottom).
             // So in Temp Canvas: Top=MaxHz, Bottom=0Hz for the whole buffer.
             // The sub-selection sy, sh selects a slice.
             // If we select sy=0, sh=th, we get full range.
             // In full range: Top(0) is MaxHz, Bottom(h) is 0Hz.
             
             // Calc current display max
             let maxCompFreq = 0; state.components.forEach(c => { if (c.freq > maxCompFreq) maxCompFreq = c.freq; });
             const strictMaxFreq = Math.max(20, Math.ceil(maxCompFreq * 1.5));
             
             // Y=0 -> dispEnd (Top), Y=h -> dispStart (Bottom)
             // val = dispStart + (dispEnd - dispStart) * (1 - y/h)
             
             const nyquist = state.sampleRate / 2;
             const fStart = state.viewAbs.startFreq;
             const fEnd = state.viewAbs.endFreq > 0 ? state.viewAbs.endFreq : strictMaxFreq;
             
             const dispStart = Math.min(fStart, nyquist);
             const dispEnd = Math.min(fEnd, nyquist);
             
             const f = dispStart + (dispEnd - dispStart) * (1 - (y/h));
             
             state.selectedFrequency = Math.max(0, Math.min(f, dispEnd));
             if(elements.plotInfo) elements.plotInfo.innerText = `Freq: ${state.selectedFrequency.toFixed(2)} Hz`;

             saveState();
        };
        
        specCanvas.addEventListener('pointerdown', (e) => {
            specCanvas.setPointerCapture(e.pointerId);
            handleSpecDrag(e);
        });
        specCanvas.addEventListener('pointermove', (e) => {
            if(e.buttons === 1) {
                specCanvas.style.cursor = 'crosshair';
                handleSpecDrag(e);
            } else {
                specCanvas.style.cursor = 'default';
            }
        });
        specCanvas.addEventListener('pointerup', (e) => {
             specCanvas.releasePointerCapture(e.pointerId);
             specCanvas.style.cursor = 'default';
        });
    }
}


// AUDIO LOGIC (Exact Copyish)
window.toggleAudio = () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    if (isPlaying) {
        stopAudio();
        return;
    }
    isPlaying = true;
    updatePlayButtons();
    const buffer = generateAudioBuffer();
    currentSource = audioCtx.createBufferSource();
    currentSource.buffer = buffer;
    currentSource.connect(audioCtx.destination);
    audioStartTime = audioCtx.currentTime;
    currentSource.onended = () => {
        if (isPlaying) {
            isPlaying = false;
            updatePlayButtons();
        }
    };
    currentSource.start();
};

function stopAudio() {
    if (currentSource) {
        try { currentSource.stop(); } catch (e) { }
        currentSource = null;
    }
    isPlaying = false;
    updatePlayButtons();
}

function updatePlayButtons() {
    const signalPlayStop = document.getElementById('btn-play-signal');
    if (signalPlayStop) {
        if (isPlaying) {
            signalPlayStop.classList.add('playing');
            const s = signalPlayStop.querySelector('span');
            if (s) s.innerText = 'stop';
        } else {
            signalPlayStop.classList.remove('playing');
            const s = signalPlayStop.querySelector('span');
            if (s) s.innerText = 'play_arrow';
        }
    }
}

function generateAudioBuffer() {
    const duration = 5.0; // Fixed duration
    const sr = audioCtx.sampleRate;
    const totalSamples = sr * duration;
    const buffer = audioCtx.createBuffer(1, totalSamples, sr);
    const data = buffer.getChannelData(0);

    const K = state.audioMultiplier;

    for (let i = 0; i < totalSamples; i++) {
        const t = i / sr; // Audio Time
        let val = 0;
        state.components.forEach(comp => {
            let compVal = comp.amp * getWaveValue(t, comp.freq * K, comp.phase || 0, comp.waveType || 'sine');
            // Apply envelope
            if (t < comp.startTime || t > comp.endTime) {
                compVal = 0;
            } else {
                const dur = comp.endTime - comp.startTime;
                if (dur > 0.01) {
                    const tNorm = (t - comp.startTime) / dur;
                    compVal *= getEnvelopeValue(tNorm, comp.envelopeType, comp.envelopeParams);
                }
            }
            val += compVal;
        });
        data[i] = Math.tanh(val * 0.5) * state.masterVolume;
    }
    return buffer;
}

window.exportComponents = () => {
    const data = JSON.stringify(state.components, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stft_components.json';
    a.click();
    URL.revokeObjectURL(url);
};

window.triggerImport = () => {
    const el = document.getElementById('import-file');
    if(el) el.click();
};

window.importComponents = (input) => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (Array.isArray(data)) {
                state.components = data.map(c => {
                    if (!c.id) c.id = Math.random().toString(36).substr(2, 9);
                    return c;
                });
                renderComponentsUI();
                saveState();
            }
        } catch (err) { alert(err.message); }
    };
    reader.readAsText(file);
    input.value = ''; 
};

init();
