/**
 * L-system explorer. Validated rewriting rules expand an axiom, then a turtle interpreter turns symbols into line segments.
 */
import * as THREE from 'three';
import { OrbitControls } from '../../Lib/Three/OrbitControls.js';

// Parallel rewriting: each generation reads only the previous generation.
const MAX_SYMBOLS = 300000;
/**
 * Parse one symbol replacement per line and reject malformed or duplicate rules.
 *
 * @param text - Text to parse or display.
 * @returns Map from each input symbol to its validated replacement string.
 */
function parseRules(text) {
    const rules = new Map();
    for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        const match = line.trim().match(/^(\S)\s*(?:->|=)\s*(.*)$/);
        if (!match) throw new Error('Use one rule per line, for example F = F[+F]F[-F]F.');
        if (rules.has(match[1])) throw new Error(`Duplicate rule for ${match[1]}.`);
        rules.set(match[1], match[2].replace(/\s/g, ''));
    }
    return rules;
}
/**
 * Rewrite from the previous word only and stop if the expansion exceeds the size limit.
 *
 * @param axiom - Initial L-system word before rewriting.
 * @param rules - Map of symbols to replacement words.
 * @param iterations - Number of parallel rewriting generations.
 * @returns Final expanded word after the requested rewriting iterations.
 */
function expand(axiom, rules, iterations) {
    let word = axiom;
    if (word.length > MAX_SYMBOLS) throw new Error('The axiom is too long.');
    for (let i = 0; i < iterations; i++) {
        const parts = [];
        let length = 0;
        for (const symbol of word) {
            const replacement = rules.has(symbol) ? rules.get(symbol) : symbol;
            length += replacement.length;
            if (length > MAX_SYMBOLS) throw new Error('Pattern exceeds 300,000 symbols. Reduce recursion or simplify the rules.');
            parts.push(replacement);
        }
        word = parts.join('');
    }
    return word;
}
/**
 * Execute turtle commands; the stack saves and restores position/heading at branches.
 *
 * @param word - Expanded L-system symbols interpreted as turtle commands.
 * @param angle - Turtle turning angle in degrees.
 * @param length - Length of each turtle step in world units.
 * @param heading - Initial turtle direction in degrees.
 * @returns Flat line-segment coordinates produced by the turtle interpreter.
 */
function trace(word, angle, length, heading) {
    const vertices = [];
    const stack = [];
    let x = 0, y = 0, direction = heading * Math.PI / 180;
    const turn = angle * Math.PI / 180;
    for (const symbol of word) {
        if (symbol === 'F' || symbol === 'G' || symbol === 'f') {
            const nx = x + Math.cos(direction) * length;
            const ny = y + Math.sin(direction) * length;
            if (symbol !== 'f') vertices.push(x, y, 0, nx, ny, 0);
            x = nx; y = ny;
        } else if (symbol === '+') direction += turn;
        else if (symbol === '-') direction -= turn;
        else if (symbol === '|') direction += Math.PI;
        else if (symbol === '[') stack.push({ x, y, direction });
        else if (symbol === ']') {
            if (!stack.length) throw new Error('Unmatched closing bracket ].');
            ({ x, y, direction } = stack.pop());
        }
    }
    if (stack.length) throw new Error('Unmatched opening bracket [.');
    if (!vertices.length) throw new Error('No branches to draw. Use F or G in the generated pattern.');
    return vertices;
}
const examples = [
    { name: 'Branching tree', axiom: 'F', rules: 'F = F[+F]F[-F]F', angle: 25.7, iterations: 4, heading: 90 },
    { name: 'Fern', axiom: 'X', rules: 'X = F+[[X]-X]-F[-FX]+X\nF = FF', angle: 25, iterations: 6, heading: 90 },
    { name: 'Koch snowflake', axiom: 'F--F--F', rules: 'F = F+F--F+F', angle: 60, iterations: 4, heading: 0 },
    { name: 'Sierpinski triangle', axiom: 'F-G-G', rules: 'F = F-G+F+G-F\nG = GG', angle: 120, iterations: 6, heading: 0 },
    { name: 'Dragon curve', axiom: 'FX', rules: 'X = X+YF+\nY = -FX-Y', angle: 90, iterations: 11, heading: 0 },
    { name: 'Hilbert curve', axiom: 'A', rules: 'A = +BF-AFA-FB+\nB = -AF+BFB+FA-', angle: 90, iterations: 5, heading: 0 },
];
const container = document.getElementById('lsystem-view');
const panel = document.querySelector('.lsystem-info');
panel.innerHTML = `
    <h1>L-System V2</h1>
    <p>Simple rules. Intricate structures.</p>
    <h2>Examples</h2><div id="lsystem-examples" class="example-buttons"></div>
    <form id="lsystem-form">
        <label for="axiom">Axiom</label><input id="axiom" class="form-control form-control-sm" maxlength="500" required>
        <label for="rules">Rules <small>One per line; an empty replacement deletes a symbol.</small></label>
        <textarea id="rules" class="form-control form-control-sm" rows="3" spellcheck="false"></textarea>
        <label for="iterations">Recursion <output id="iterations-value">4</output></label>
        <input id="iterations" type="range" min="0" max="12" value="4">
        <div class="parameter-row">
            <div><label for="angle">Turn angle (°)</label><input id="angle" class="form-control form-control-sm" type="number" min="0" max="360" step="0.1" required></div>
            <div><label for="length">Branch length</label><input id="length" class="form-control form-control-sm" type="number" min="0.1" max="20" step="0.1" value="1" required></div>
        </div>
        <label for="heading">Initial heading (°)</label><input id="heading" class="form-control form-control-sm" type="number" min="-360" max="360" step="1" required>
        <div class="parameter-row actions"><button type="submit" class="btn btn-primary btn-sm">Generate</button><button id="fit-view" type="button" class="btn btn-outline-light btn-sm">Fit view</button></div>
    </form>
    <p id="lsystem-status" role="status" aria-live="polite"></p>
    <details><summary>Drawing commands</summary><p>F / G: draw forward · f: move without drawing · + / −: turn · [: save position · ]: restore position · |: turn around. Other symbols only participate in rewriting.</p></details>
    <small>Recursion 0 draws the axiom. Examples generate immediately.<br>Drag to orbit · Scroll to zoom · Right-drag to pan.</small>`;
/**
 * Find a named form control used by the L-system editor.
 *
 * @param id - DOM element identifier used to find its control or canvas.
 * @returns DOM control matching the requested identifier.
 */
const field = (id) => document.getElementById(id);
const status = field('lsystem-status');
const palette = getComputedStyle(document.documentElement);
/**
 * Read a shared CSS palette value and convert it to a Three.js color.
 *
 * @param name - CSS custom-property name or display label used by this operation.
 * @returns Three.js color parsed from the shared CSS palette.
 */
const themeColor = (name) => new THREE.Color(palette.getPropertyValue(name).trim());
const scene = new THREE.Scene();
scene.background = themeColor('--site-bg');
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000000);
let renderer;
try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (error) {
    const message = document.getElementById('scene-error');
    message.hidden = false;
    message.textContent = 'Unable to start the scene. Please enable WebGL in your browser.';
    throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.domElement.setAttribute('aria-label', 'Generated L-system pattern; drag to orbit and scroll to zoom');
container.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const material = new THREE.LineBasicMaterial({ color: themeColor('--site-accent') });
let drawing;
let bounds;
/**
 * Frame the generated line geometry so the full pattern is visible.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function fitView() {
    if (!bounds) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const extent = bounds.getSize(new THREE.Vector3());
    const distance = Math.max(extent.y, extent.x / camera.aspect, 1) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.2;
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(0, 0, distance));
    controls.minDistance = distance / 100;
    controls.maxDistance = distance * 20;
    camera.near = Math.max(distance / 10000, 0.001);
    camera.far = distance * 100;
    camera.updateProjectionMatrix();
    controls.update();
    controls.saveState();
}
/**
 * Validate inputs, replace the displayed geometry, and report generation errors.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function generate() {
    try {
        const axiom = field('axiom').value.replace(/\s/g, '');
        if (!axiom) throw new Error('Enter an axiom.');
        const iterations = Number(field('iterations').value);
        const angle = Number(field('angle').value);
        const length = Number(field('length').value);
        const heading = Number(field('heading').value);
        if (!Number.isInteger(iterations) || iterations < 0 || iterations > 12 || !Number.isFinite(angle) || angle < 0 || angle > 360 || !Number.isFinite(length) || length < 0.1 || length > 20 || !Number.isFinite(heading) || Math.abs(heading) > 360) throw new Error('Check the parameter ranges.');
        const word = expand(axiom, parseRules(field('rules').value), iterations);
        const vertices = trace(word, angle, length, heading);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.computeBoundingBox();
        if (drawing) { scene.remove(drawing); drawing.geometry.dispose(); }
        drawing = new THREE.LineSegments(geometry, material);
        scene.add(drawing);
        bounds = geometry.boundingBox.clone();
        fitView();
        status.textContent = `Recursion ${iterations} · ${word.length.toLocaleString()} symbols · ${(vertices.length / 6).toLocaleString()} segments`;
    } catch (error) {
        status.textContent = error.message;
    }
}
/**
 * Populate the form from a preset and generate its pattern.
 *
 * @param example - L-system preset containing form settings and rewrite rules.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function loadExample(example) {
    for (const key of ['axiom', 'rules', 'angle', 'heading', 'iterations']) field(key).value = example[key];
    field('length').value = 1;
    field('iterations-value').value = example.iterations;
    generate();
}
for (const example of examples) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-outline-light btn-sm';
    button.textContent = example.name;
    button.addEventListener('click', () => loadExample(example));
    field('lsystem-examples').appendChild(button);
}
field('lsystem-form').addEventListener('submit', (event) => { event.preventDefault(); generate(); });
field('iterations').addEventListener('input', () => { field('iterations-value').value = field('iterations').value; generate(); });
field('fit-view').addEventListener('click', fitView);
/**
 * Synchronize renderer dimensions and camera projection with the available container size.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function resize() {
    const mobile = window.matchMedia('(max-width: 767.98px)').matches;
    const width = Math.max(container.clientWidth - (mobile ? 0 : panel.offsetWidth), 1);
    const height = mobile ? Math.max(window.innerHeight * 0.55, 350) : Math.max(container.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    fitView();
}
// Recalculate view dimensions when the surrounding layout changes.
new ResizeObserver(resize).observe(container);
resize();
loadExample(examples[0]);
// Keep visual frames separate from the simulation's own update timing.
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
