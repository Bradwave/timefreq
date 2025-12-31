
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
    windowType: 'gaussian', // 'gaussian' | 'square'
    windowWidth: 0.2,
    spectrogramLogScale: false,

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
    windowWidthSlider: document.getElementById('window-width-slider'),
    windowWidthDisplay: document.getElementById('window-width-display'),
    
    canvases: {
        signal: document.getElementById('signal-canvas'),
        abs: document.getElementById('abs-transform-canvas'),
        spectrogram: document.getElementById('spectrogram-canvas')
    },
    ctx: {},
    plotInfo: document.getElementById('freq-info'),
    timeInfo: document.getElementById('time-info')
};

Object.keys(elements.canvases).forEach(k => {
    if(elements.canvases[k]) elements.ctx[k] = elements.canvases[k].getContext('2d');
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
    // updateFreqSliderUI();
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
    setWindowType(state.windowType);
    
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
            if (parsed.spectrogramLogScale !== undefined) state.spectrogramLogScale = parsed.spectrogramLogScale;
            if (parsed.isSidebarCollapsed !== undefined) state.isSidebarCollapsed = parsed.isSidebarCollapsed;

        } catch (e) { console.error(e); }
    }
}

// Window Type
window.setWindowType = (type) => {
    state.windowType = type;
    document.querySelectorAll('.segmented-option').forEach(el => el.classList.remove('active'));
    // Manual Update of UI classes since unique ID might conflict if reused
    const btnG = document.getElementById('window-gaussian');
    const btnS = document.getElementById('window-square');
    if(type === 'gaussian' && btnG) btnG.classList.add('active');
    if(type === 'square' && btnS) btnS.classList.add('active');
    saveState();
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
                        <div class="segmented-control" style="margin: 0; width: 120px; transform: scale(0.9);">
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

function fft(data, bufferLike, len) {
    const N = len || data.length;

    // Bit Rev Table
    if (N !== fftBitRevN) {
        fftBitRevN = N;
        if (N > fftBitRev.length) {
            fftBitRev = new Uint32Array(N);
        }
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
    for (let len = 2; len <= N; len <<= 1) {
        const half = len >> 1;
        const angleBase = -2 * Math.PI / len;
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
    return output;
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

    // 2. STFT Computing
    const stftData = computeSTFT(displaySignal, state.sampleRate, 5.0);

    // 3. Drawing
    // Max Freq for FFT Plot
    let maxCompFreq = 0; state.components.forEach(c => { if (c.freq > maxCompFreq) maxCompFreq = c.freq; });
    const strictMaxFreq = Math.max(20, Math.ceil(maxCompFreq * 1.5));
    const maxDisplayFreq = state.viewAbs.endFreq > 0 ? Math.min(state.viewAbs.endFreq, strictMaxFreq) : strictMaxFreq;
    if (state.viewAbs.startFreq > strictMaxFreq) state.viewAbs.startFreq = Math.max(0, strictMaxFreq - 10);

    drawSignalPlot(elements.ctx.signal, displaySignal, elements.canvases.signal);
    drawAbsTransform(elements.ctx.abs, fftResult, elements.canvases.abs, maxDisplayFreq, N_FFT);
    drawSpectrogram(elements.ctx.spectrogram, stftData, elements.canvases.spectrogram, maxDisplayFreq);
}

// STFT Core
// Only recompute when signal changes? For now run every frame for simplicity
function computeSTFT(signalBuffer, sampleRate, duration) {
    const numCols = 200; // Resolution
    const stftData = []; 
    
    const wWidthSeconds = state.windowWidth;
    const wSamples = Math.floor(wWidthSeconds * sampleRate);
    const N_FFT = 256; 
    
    // Precompute Window
    const winFunc = new Float32Array(wSamples);
    if(state.windowType === 'square') {
        winFunc.fill(1.0);
    } else {
        // Gaussian
        const sigma = wSamples / 6; 
        const center = wSamples / 2;
        for(let i=0; i<wSamples; i++) {
            const x = i - center;
            winFunc[i] = Math.exp(-(x*x)/(2*sigma*sigma));
        }
    }

    // Use strictly the visual duration (5.0s) for calculation
    const numSamples = Math.floor(duration * sampleRate);
    const stepSize = numSamples / numCols;
    const fftIn = new Float32Array(N_FFT);
    // const fftOut = new Float32Array(N_FFT * 2);

    for(let t=0; t<numCols; t++) {
        const centerIdx = Math.floor(t * stepSize);
        const startIdx = centerIdx - Math.floor(wSamples/2);
        
        fftIn.fill(0);
        
        // Windowing
        for(let i=0; i<wSamples; i++) {
            const sigIdx = startIdx + i;
            if(sigIdx >= 0 && sigIdx < numSamples && sigIdx < signalBuffer.length) {
                const val = signalBuffer[sigIdx].val * winFunc[i];
                if(i < N_FFT) {
                   fftIn[i] = val;
                }
            }
        }
        
        // We reuse the basic fft function, but it expects [{re,im}]. 
        // Our 'fft' function is optimized for object arrays however. 
        // We should make a lightweight fft or adapt the input. 
        // Adapting input to [{re,im}] for every column is slow (allocations).
        // Let's create a temp object buffer for STFT FFT.
        
        if(!state.buffers.stftInput) state.buffers.stftInput = [];
        const stftInput = ensureObjectArray(state.buffers.stftInput, N_FFT, ()=>({re:0, im:0}));
        
        for(let i=0; i<N_FFT; i++) {
            stftInput[i].re = fftIn[i];
            stftInput[i].im = 0;
        }
        
        if(!state.buffers.stftOutput) state.buffers.stftOutput = [];
        const stftOutput = ensureObjectArray(state.buffers.stftOutput, N_FFT, ()=>({re:0, im:0}));
        
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
    
    // Calculate Dest Rect based on Y-Zoom (maxFreq)
    // maxFreq limits the top frequency shown.
    // th bins cover 0 to sampleRate/2 (128Hz).
    
    const nyquist = state.sampleRate / 2;
    // maxFreq is determined by global FFT zoom, usually > signal.
    // Clamp to nyquist for safety
    const displayMax = Math.min(maxFreq, nyquist);
    const yMaxRatio = displayMax / nyquist;
    
    // Image Coordinates: Top is High Freq, Bottom is 0 Hz.
    // We want 0 Hz to displayMax Hz.
    // 0 Hz is at Bottom (y=th). displayMax is at y = th - (ratio * th).
    
    const sh = yMaxRatio * th; 
    const sy = th - sh; 
    
    // Prevent invalid source rect
    if(sw <= 0 || sh <= 0) return;

    ctx.imageSmoothingEnabled = true; 
    ctx.drawImage(elements.tempCanvas, sx, sy, sw, sh, 0, 0, w, h);
    
    if(state.showAxis) {
        drawAxis(ctx, w, h, [state.zoomStart, state.zoomEnd], [0, displayMax], ' s', ' Hz');
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

function setupListeners() {
    // Window Width
    if(elements.windowWidthSlider) {
        elements.windowWidthSlider.addEventListener('input', (e) => {
           state.windowWidth = parseFloat(e.target.value);
           elements.windowWidthDisplay.innerText = state.windowWidth.toFixed(2) + 's';
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
    const absCanvas = elements.canvases.abs;
    if(absCanvas) {
        absCanvas.addEventListener('pointerdown', (e) => {
            absCanvas.setPointerCapture(e.pointerId);
            if (e.ctrlKey) {
                state.viewAbs.isPanning = true;
                state.lastMouse = { x: e.clientX, y: e.clientY };
            }
        });
        absCanvas.addEventListener('pointermove', (e) => {
             if (e.ctrlKey) absCanvas.style.cursor = 'grab';
             else absCanvas.style.cursor = 'default';
             
             if(state.viewAbs.isPanning) {
                 const rect = absCanvas.getBoundingClientRect();
                 const w = rect.width;
                 const dx = e.clientX - state.lastMouse.x;
                 // Simple pan logic for freq
                 // ... (Simplified for brevity as fourier3d logic was complex)
                 // Just keeping it simple for now to avoid compilation errors if something missing
                 state.lastMouse = { x: e.clientX, y: e.clientY };
             }
        });
        absCanvas.addEventListener('pointerup', (e) => {
            state.viewAbs.isPanning = false;
            absCanvas.releasePointerCapture(e.pointerId);
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
