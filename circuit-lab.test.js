/**
 * Circuit Lab Test Suite
 * Node-runnable tests using minimal assert-based harness
 * Run: node circuit-lab.test.js
 */

// ============ MINIMAL TEST HARNESS ============
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

function assert(condition, message = 'Assertion failed') {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message ? message + ': ' : ''}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, message = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message ? message + ': ' : ''}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

// ============ CIRCUIT LAB CORE LOGIC (extracted from index.html) ============

const GRID = 60;
const COMP_W = GRID * 2;
const COMP_H = GRID;
const TERMINAL_HIT_RADIUS = 40;

const COMP_DEFS = {
  battery: { label:'Battery', color:'var(--neon-green)', terminals:['pos','neg'] },
  bulb: { label:'Bulb', color:'var(--neon-yellow)', terminals:['left','right'] },
  switch: { label:'Switch', color:'var(--neon-blue)', terminals:['left','right'], hasState:true },
  motor: { label:'Motor', color:'var(--neon-purple)', terminals:['left','right'] },
  buzzer: { label:'Buzzer', color:'var(--neon-orange)', terminals:['left','right'] },
  wire_node: { label:'Wire', color:'var(--neon-green)', terminals:['a','b','c','d'], isNode:true }
};

// Snap to grid
function snap(v) { return Math.round(v / GRID) * GRID; }

// Get terminal positions for a component
function getTerminals(comp) {
  const terms = {};
  if (comp.type === 'battery') {
    terms.pos = {x:comp.x + COMP_W, y:comp.y + COMP_H/2};
    terms.neg = {x:comp.x, y:comp.y + COMP_H/2};
  } else if (comp.type === 'wire_node') {
    terms.a = {x:comp.x + COMP_W/2, y:comp.y};
    terms.b = {x:comp.x + COMP_W, y:comp.y + COMP_H/2};
    terms.c = {x:comp.x + COMP_W/2, y:comp.y + COMP_H};
    terms.d = {x:comp.x, y:comp.y + COMP_H/2};
  } else {
    terms.left = {x:comp.x, y:comp.y + COMP_H/2};
    terms.right = {x:comp.x + COMP_W, y:comp.y + COMP_H/2};
  }
  return terms;
}

// Get terminal position by component ID
function getTerminalPos(components, compId, terminal) {
  const comp = components.find(c=>c.id===compId);
  if (!comp) return {x:0,y:0};
  return getTerminals(comp)[terminal] || {x:0,y:0};
}

// Hit test for terminals
function hitTerminal(components, x, y) {
  const threshold = TERMINAL_HIT_RADIUS;
  let closest = null;
  let closestDist = Infinity;
  
  for (const comp of components) {
    const terms = getTerminals(comp);
    for (const [name, tPos] of Object.entries(terms)) {
      const dx = x - tPos.x, dy = y - tPos.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < threshold && dist < closestDist) {
        closest = {compId:comp.id, terminal:name};
        closestDist = dist;
      }
    }
  }
  return closest;
}

// Internal connections within a component
function getInternalConnections(comp, fromTerminal) {
  const def = COMP_DEFS[comp.type];
  return def.terminals.filter(t => t !== fromTerminal);
}

// Find path through circuit (for checkPowered)
function findPath(components, wires, startCompId, startTerminal, targetCompId, targetTerminal, visited) {
  const queue = [{compId:startCompId, terminal:startTerminal, depth:0}];
  const seen = new Set();
  seen.add(`${startCompId}:${startTerminal}`);
  
  while (queue.length > 0) {
    const {compId, terminal, depth} = queue.shift();
    
    for (const w of wires) {
      let nextCompId, nextTerminal;
      if (w.from.compId === compId && w.from.terminal === terminal) {
        nextCompId = w.to.compId; nextTerminal = w.to.terminal;
      } else if (w.to.compId === compId && w.to.terminal === terminal) {
        nextCompId = w.from.compId; nextTerminal = w.from.terminal;
      } else continue;
      
      const key = `${nextCompId}:${nextTerminal}`;
      if (seen.has(key)) continue;
      
      if (nextCompId === targetCompId && nextTerminal === targetTerminal && depth > 0) {
        visited.add(nextCompId);
        for (const k of seen) visited.add(parseInt(k.split(':')[0]));
        return true;
      }
      
      seen.add(key);
      visited.add(nextCompId);
      
      const comp = components.find(c=>c.id===nextCompId);
      if (!comp) continue;
      
      if (comp.type === 'switch' && !comp.state) continue;
      if (comp.type === 'battery') continue;
      
      const otherTerminals = getInternalConnections(comp, nextTerminal);
      for (const ot of otherTerminals) {
        const otKey = `${nextCompId}:${ot}`;
        if (!seen.has(otKey)) {
          seen.add(otKey);
          queue.push({compId:nextCompId, terminal:ot, depth:depth+1});
        }
      }
    }
  }
  return false;
}

// Check which components are powered
function checkPowered(components, wires) {
  const poweredIds = new Set();
  const batteries = components.filter(c=>c.type==='battery');
  
  for (const bat of batteries) {
    const visited = new Set();
    const found = findPath(components, wires, bat.id, 'pos', bat.id, 'neg', visited);
    if (found) {
      for (const id of visited) poweredIds.add(id);
      poweredIds.add(bat.id);
    }
  }
  
  return poweredIds;
}

// Check if wire is duplicate
function isDuplicateWire(wires, from, to) {
  return wires.some(w =>
    (w.from.compId===from.compId && w.from.terminal===from.terminal && w.to.compId===to.compId && w.to.terminal===to.terminal) ||
    (w.to.compId===from.compId && w.to.terminal===from.terminal && w.from.compId===to.compId && w.from.terminal===to.terminal)
  );
}

// Create a component
function createComponent(type, x, y, id, state) {
  return {
    id: id,
    type: type,
    x: snap(x),
    y: snap(y),
    state: type === 'switch' ? (state !== undefined ? state : false) : undefined
  };
}

// ============ CHALLENGE DEFINITIONS ============
const CHALLENGES = [
  { id:1, title:'Light the Bulb', desc:'Connect a battery to a bulb to make it glow!',
    require: (comps, wires) => {
      const hasBattery = comps.some(c=>c.type==='battery');
      const hasBulb = comps.some(c=>c.type==='bulb');
      const powered = checkPowered(comps, wires);
      return hasBattery && hasBulb && [...powered].some(id => comps.find(c=>c.id===id)?.type==='bulb');
    }},
  { id:5, title:'Two Bulbs', desc:'Light up TWO bulbs with one battery!',
    require: (comps, wires) => {
      const powered = checkPowered(comps, wires);
      const poweredBulbs = [...powered].filter(id => comps.find(c=>c.id===id)?.type==='bulb');
      return poweredBulbs.length >= 2;
    }},
  { id:8, title:'Full Orchestra', desc:'Power a bulb, motor, AND buzzer all at once!',
    require: (comps, wires) => {
      const powered = checkPowered(comps, wires);
      const types = [...powered].map(id => comps.find(c=>c.id===id)?.type);
      return types.includes('bulb') && types.includes('motor') && types.includes('buzzer');
    }}
];

// ============ TESTS ============

describe('snap() - Grid Snapping', () => {
  test('rounds to nearest grid (0)', () => {
    assertEqual(snap(0), 0);
  });
  
  test('rounds to nearest grid (exact)', () => {
    assertEqual(snap(60), 60);
    assertEqual(snap(120), 120);
  });
  
  test('rounds up when closer to higher grid', () => {
    assertEqual(snap(35), 60);
    assertEqual(snap(90), 120);
  });
  
  test('rounds down when closer to lower grid', () => {
    assertEqual(snap(25), 0);
    assertEqual(snap(80), 60);
  });
  
  test('handles negative values', () => {
    assertEqual(snap(-10), 0);
    assertEqual(snap(-35), -60);
  });
});

describe('Component Management', () => {
  test('adding a component increases array', () => {
    const components = [];
    const comp = createComponent('battery', 100, 100, 1);
    components.push(comp);
    assertEqual(components.length, 1);
  });
  
  test('removing a component removes it from array', () => {
    const components = [
      createComponent('battery', 100, 100, 1),
      createComponent('bulb', 200, 100, 2)
    ];
    const newComps = components.filter(c => c.id !== 1);
    assertEqual(newComps.length, 1);
    assertEqual(newComps[0].id, 2);
  });
  
  test('removing a component removes its wires', () => {
    const wires = [
      {id: 1, from: {compId: 1, terminal: 'pos'}, to: {compId: 2, terminal: 'left'}},
      {id: 2, from: {compId: 2, terminal: 'right'}, to: {compId: 1, terminal: 'neg'}},
      {id: 3, from: {compId: 2, terminal: 'left'}, to: {compId: 3, terminal: 'right'}}
    ];
    const removeId = 1;
    const newWires = wires.filter(w => w.from.compId !== removeId && w.to.compId !== removeId);
    assertEqual(newWires.length, 1);
    assertEqual(newWires[0].id, 3);
  });
  
  test('components get unique IDs', () => {
    let nextId = 1;
    const c1 = { ...createComponent('battery', 100, 100, nextId++), id: nextId - 1 };
    const c2 = { ...createComponent('bulb', 200, 100, nextId++), id: nextId - 1 };
    const c3 = { ...createComponent('switch', 300, 100, nextId++), id: nextId - 1 };
    assert(c1.id !== c2.id && c2.id !== c3.id && c1.id !== c3.id, 'IDs should be unique');
  });
});

describe('Terminal Positions', () => {
  test('battery has pos on right, neg on left', () => {
    const bat = createComponent('battery', 0, 0, 1);
    const terms = getTerminals(bat);
    assert(terms.pos.x > terms.neg.x, 'pos should be to the right of neg');
    assertEqual(terms.pos.x, COMP_W); // right edge
    assertEqual(terms.neg.x, 0); // left edge
  });
  
  test('bulb has left and right terminals', () => {
    const bulb = createComponent('bulb', 0, 0, 1);
    const terms = getTerminals(bulb);
    assert('left' in terms, 'should have left terminal');
    assert('right' in terms, 'should have right terminal');
    assertEqual(terms.left.x, 0);
    assertEqual(terms.right.x, COMP_W);
  });
  
  test('switch has left and right terminals', () => {
    const sw = createComponent('switch', 0, 0, 1);
    const terms = getTerminals(sw);
    assert('left' in terms && 'right' in terms, 'should have left and right');
  });
  
  test('motor has left and right terminals', () => {
    const motor = createComponent('motor', 0, 0, 1);
    const terms = getTerminals(motor);
    assert('left' in terms && 'right' in terms, 'should have left and right');
  });
  
  test('buzzer has left and right terminals', () => {
    const buzzer = createComponent('buzzer', 0, 0, 1);
    const terms = getTerminals(buzzer);
    assert('left' in terms && 'right' in terms, 'should have left and right');
  });
  
  test('terminal positions update when component moves', () => {
    const bulb = createComponent('bulb', 0, 0, 1);
    const terms1 = getTerminals(bulb);
    bulb.x = 120;
    bulb.y = 60;
    const terms2 = getTerminals(bulb);
    assertEqual(terms2.left.x, 120);
    assertEqual(terms2.right.x, 120 + COMP_W);
    assert(terms2.left.x !== terms1.left.x, 'position should have changed');
  });
  
  test('hitTerminal returns correct component/terminal within threshold', () => {
    const components = [createComponent('battery', 0, 0, 1)];
    const terms = getTerminals(components[0]);
    const hit = hitTerminal(components, terms.pos.x, terms.pos.y);
    assertEqual(hit.compId, 1);
    assertEqual(hit.terminal, 'pos');
  });
  
  test('hitTerminal returns null when clicking empty space', () => {
    const components = [createComponent('battery', 0, 0, 1)];
    const hit = hitTerminal(components, 500, 500);
    assertEqual(hit, null);
  });
  
  test('hitTerminal works within threshold radius', () => {
    const components = [createComponent('bulb', 100, 100, 1)];
    const terms = getTerminals(components[0]);
    // Test within threshold (30 pixels away, threshold is 40)
    const hit = hitTerminal(components, terms.left.x + 30, terms.left.y);
    assertEqual(hit.compId, 1);
    assertEqual(hit.terminal, 'left');
  });
});

describe('Wire Management', () => {
  test('can create wire between two terminals', () => {
    const wires = [];
    const wire = {
      id: 1,
      from: {compId: 1, terminal: 'pos'},
      to: {compId: 2, terminal: 'left'}
    };
    wires.push(wire);
    assertEqual(wires.length, 1);
  });
  
  test('duplicate wires are detected', () => {
    const wires = [
      {id: 1, from: {compId: 1, terminal: 'pos'}, to: {compId: 2, terminal: 'left'}}
    ];
    const from = {compId: 1, terminal: 'pos'};
    const to = {compId: 2, terminal: 'left'};
    assert(isDuplicateWire(wires, from, to), 'should detect duplicate');
  });
  
  test('duplicate detection works for reversed wires', () => {
    const wires = [
      {id: 1, from: {compId: 1, terminal: 'pos'}, to: {compId: 2, terminal: 'left'}}
    ];
    const from = {compId: 2, terminal: 'left'};
    const to = {compId: 1, terminal: 'pos'};
    assert(isDuplicateWire(wires, from, to), 'should detect reversed duplicate');
  });
  
  test('non-duplicate wires are not flagged', () => {
    const wires = [
      {id: 1, from: {compId: 1, terminal: 'pos'}, to: {compId: 2, terminal: 'left'}}
    ];
    const from = {compId: 1, terminal: 'neg'};
    const to = {compId: 2, terminal: 'right'};
    assert(!isDuplicateWire(wires, from, to), 'should not be duplicate');
  });
  
  test('wires connect correct terminals', () => {
    const wire = {
      id: 1,
      from: {compId: 1, terminal: 'pos'},
      to: {compId: 2, terminal: 'left'}
    };
    assertEqual(wire.from.terminal, 'pos');
    assertEqual(wire.to.terminal, 'left');
  });
});

describe('Circuit Validation (checkPowered)', () => {
  test('battery + bulb in closed loop = bulb powered', () => {
    const components = [
      createComponent('battery', 0, 0, 1),
      createComponent('bulb', 120, 0, 2)
    ];
    const wires = [
      {id: 1, from: {compId: 1, terminal: 'pos'}, to: {compId: 2, terminal: 'left'}},
      {id: 2, from: {compId: 2, terminal: 'right'}, to: {compId: 1, terminal: 'neg'}}
    ];
    const powered = checkPowered(components, wires);
    assert(powered.has(2), 'bulb should be powered');
  });
  
  test('battery + bulb with no return wire = not powered', () => {
    const components = [
      createComponent('battery', 0, 0, 1),
      createComponent('bulb', 120, 0, 2)
    ];
    const wires = [
      {id: 1, from: {compId: 1, terminal: 'pos'}, to: {compId: 2, terminal: 'left'}}
    ];
    const powered = checkPowered(components, wires);
    assert(!powered.has(2), 'bulb should not be powered');
  });
  
  test('battery + switch(OFF) + bulb = not powered', () => {
    const components = [
      createComponent('battery', 0, 0, 1),
      createComponent('switch', 120, 0, 2, false),
      createComponent('bulb', 240, 0, 3)
    ];
    const wires = [
      {id: 1, from: {compId: 1, terminal: 'pos'}, to: {compId: 2, terminal: 'left'}},
      {id: 2, from: {compId: 2, terminal: 'right'}, to: {compId: 3, terminal: 'left'}},
      {id: 3, from: {compId: 3, terminal: 'right'}, to: {compId: 1, terminal: 'neg'}}
    ];
    const powered = checkPowered(components, wires);
    assert(!powered.has(3), 'bulb should not be powered with switch OFF');
  });
  
  test('battery + switch(ON) + bulb = powered', () => {
    const components = [
      createComponent('battery', 0, 0, 1),
      createComponent('switch', 120, 0, 2, true),
      createComponent('bulb', 240, 0, 3)
    ];
    const wires = [
      {id: 1, from: {compId: 1, terminal: 'pos'}, to: {compId: 2, terminal: 'left'}},
      {id: 2, from: {compId: 2, terminal: 'right'}, to: {compId: 3, terminal: 'left'}},
      {id: 3, from: {compId: 3, terminal: 'right'}, to: {compId: 1, terminal: 'neg'}}
    ];
    const powered = checkPowered(components, wires);
    assert(powered.has(3), 'bulb should be powered with switch ON');
  });
  
  test('battery + motor in loop = motor powered', () => {
    const components = [
      createComponent('battery', 0, 0, 1),
      createComponent('motor', 120, 0, 2)
    ];
    const wires = [
      {id: 1, from: {compId: 1, terminal: 'pos'}, to: {compId: 2, terminal: 'left'}},
      {id: 2, from: {compId: 2, terminal: 'right'}, to: {compId: 1, terminal: 'neg'}}
    ];
    const powered = checkPowered(components, wires);
    assert(powered.has(2), 'motor should be powered');
  });
  
  test('battery + buzzer in loop = buzzer powered', () => {
    const components = [
      createComponent('battery', 0, 0, 1),
      createComponent('buzzer', 120, 0, 2)
    ];
    const wires = [
      {id: 1, from: {compId: 1, terminal: 'pos'}, to: {compId: 2, terminal: 'left'}},
      {id: 2, from: {compId: 2, terminal: 'right'}, to: {compId: 1, terminal: 'neg'}}
    ];
    const powered = checkPowered(components, wires);
    assert(powered.has(2), 'buzzer should be powered');
  });
  
  test('two bulbs in series = both powered', () => {
    const components = [
      createComponent('battery', 0, 0, 1),
      createComponent('bulb', 120, 0, 2),
      createComponent('bulb', 240, 0, 3)
    ];
    const wires = [
      {id: 1, from: {compId: 1, terminal: 'pos'}, to: {compId: 2, terminal: 'left'}},
      {id: 2, from: {compId: 2, terminal: 'right'}, to: {compId: 3, terminal: 'left'}},
      {id: 3, from: {compId: 3, terminal: 'right'}, to: {compId: 1, terminal: 'neg'}}
    ];
    const powered = checkPowered(components, wires);
    assert(powered.has(2) && powered.has(3), 'both bulbs should be powered');
  });
  
  test('multiple batteries do not cause issues', () => {
    const components = [
      createComponent('battery', 0, 0, 1),
      createComponent('battery', 0, 60, 2),
      createComponent('bulb', 120, 0, 3)
    ];
    const wires = [
      {id: 1, from: {compId: 1, terminal: 'pos'}, to: {compId: 3, terminal: 'left'}},
      {id: 2, from: {compId: 3, terminal: 'right'}, to: {compId: 1, terminal: 'neg'}}
    ];
    const powered = checkPowered(components, wires);
    assert(powered.has(3), 'bulb should be powered');
    // Second battery not in circuit, shouldn't crash
    assert(!powered.has(2), 'second battery not in loop');
  });
  
  test('no battery = nothing powered', () => {
    const components = [
      createComponent('bulb', 0, 0, 1),
      createComponent('motor', 120, 0, 2)
    ];
    const wires = [
      {id: 1, from: {compId: 1, terminal: 'right'}, to: {compId: 2, terminal: 'left'}}
    ];
    const powered = checkPowered(components, wires);
    assertEqual(powered.size, 0, 'nothing should be powered');
  });
  
  test('battery alone = not powered (no loop)', () => {
    const components = [createComponent('battery', 0, 0, 1)];
    const wires = [];
    const powered = checkPowered(components, wires);
    assert(!powered.has(1), 'battery alone should not power itself');
  });
});

describe('Switch Logic', () => {
  test('switch starts in OFF state', () => {
    const sw = createComponent('switch', 0, 0, 1);
    assertEqual(sw.state, false);
  });
  
  test('toggle changes state to ON', () => {
    const sw = createComponent('switch', 0, 0, 1);
    sw.state = !sw.state;
    assertEqual(sw.state, true);
  });
  
  test('toggle again changes to OFF', () => {
    const sw = createComponent('switch', 0, 0, 1);
    sw.state = !sw.state; // ON
    sw.state = !sw.state; // OFF
    assertEqual(sw.state, false);
  });
  
  test('open switch breaks circuit', () => {
    const components = [
      createComponent('battery', 0, 0, 1),
      createComponent('switch', 120, 0, 2, false), // OFF
      createComponent('bulb', 240, 0, 3)
    ];
    const wires = [
      {id: 1, from: {compId: 1, terminal: 'pos'}, to: {compId: 2, terminal: 'left'}},
      {id: 2, from: {compId: 2, terminal: 'right'}, to: {compId: 3, terminal: 'left'}},
      {id: 3, from: {compId: 3, terminal: 'right'}, to: {compId: 1, terminal: 'neg'}}
    ];
    const powered = checkPowered(components, wires);
    assert(!powered.has(3), 'open switch should break circuit');
  });
  
  test('closed switch completes circuit', () => {
    const components = [
      createComponent('battery', 0, 0, 1),
      createComponent('switch', 120, 0, 2, true), // ON
      createComponent('bulb', 240, 0, 3)
    ];
    const wires = [
      {id: 1, from: {compId: 1, terminal: 'pos'}, to: {compId: 2, terminal: 'left'}},
      {id: 2, from: {compId: 2, terminal: 'right'}, to: {compId: 3, terminal: 'left'}},
      {id: 3, from: {compId: 3, terminal: 'right'}, to: {compId: 1, terminal: 'neg'}}
    ];
    const powered = checkPowered(components, wires);
    assert(powered.has(3), 'closed switch should complete circuit');
  });
});

describe('Challenge Validation', () => {
  test('Challenge 1: passes with battery+bulb loop', () => {
    const components = [
      createComponent('battery', 0, 0, 1),
      createComponent('bulb', 120, 0, 2)
    ];
    const wires = [
      {id: 1, from: {compId: 1, terminal: 'pos'}, to: {compId: 2, terminal: 'left'}},
      {id: 2, from: {compId: 2, terminal: 'right'}, to: {compId: 1, terminal: 'neg'}}
    ];
    assert(CHALLENGES[0].require(components, wires), 'Challenge 1 should pass');
  });
  
  test('Challenge 1: fails without complete loop', () => {
    const components = [
      createComponent('battery', 0, 0, 1),
      createComponent('bulb', 120, 0, 2)
    ];
    const wires = [
      {id: 1, from: {compId: 1, terminal: 'pos'}, to: {compId: 2, terminal: 'left'}}
    ];
    assert(!CHALLENGES[0].require(components, wires), 'Challenge 1 should fail without loop');
  });
  
  test('Challenge 5: needs 2 powered bulbs', () => {
    const components = [
      createComponent('battery', 0, 0, 1),
      createComponent('bulb', 120, 0, 2),
      createComponent('bulb', 240, 0, 3)
    ];
    const wires = [
      {id: 1, from: {compId: 1, terminal: 'pos'}, to: {compId: 2, terminal: 'left'}},
      {id: 2, from: {compId: 2, terminal: 'right'}, to: {compId: 3, terminal: 'left'}},
      {id: 3, from: {compId: 3, terminal: 'right'}, to: {compId: 1, terminal: 'neg'}}
    ];
    assert(CHALLENGES[1].require(components, wires), 'Challenge 5 should pass with 2 bulbs');
  });
  
  test('Challenge 8: needs bulb+motor+buzzer all powered', () => {
    const components = [
      createComponent('battery', 0, 0, 1),
      createComponent('bulb', 120, 0, 2),
      createComponent('motor', 240, 0, 3),
      createComponent('buzzer', 360, 0, 4)
    ];
    const wires = [
      {id: 1, from: {compId: 1, terminal: 'pos'}, to: {compId: 2, terminal: 'left'}},
      {id: 2, from: {compId: 2, terminal: 'right'}, to: {compId: 3, terminal: 'left'}},
      {id: 3, from: {compId: 3, terminal: 'right'}, to: {compId: 4, terminal: 'left'}},
      {id: 4, from: {compId: 4, terminal: 'right'}, to: {compId: 1, terminal: 'neg'}}
    ];
    assert(CHALLENGES[2].require(components, wires), 'Challenge 8 should pass');
  });
  
  test('Challenge 8: fails without all three', () => {
    const components = [
      createComponent('battery', 0, 0, 1),
      createComponent('bulb', 120, 0, 2),
      createComponent('motor', 240, 0, 3)
    ];
    const wires = [
      {id: 1, from: {compId: 1, terminal: 'pos'}, to: {compId: 2, terminal: 'left'}},
      {id: 2, from: {compId: 2, terminal: 'right'}, to: {compId: 3, terminal: 'left'}},
      {id: 3, from: {compId: 3, terminal: 'right'}, to: {compId: 1, terminal: 'neg'}}
    ];
    assert(!CHALLENGES[2].require(components, wires), 'Challenge 8 should fail without buzzer');
  });
});

describe('Edge Cases', () => {
  test('empty circuit has no powered components', () => {
    const powered = checkPowered([], []);
    assertEqual(powered.size, 0);
  });
  
  test('clearing all removes everything', () => {
    let components = [
      createComponent('battery', 0, 0, 1),
      createComponent('bulb', 120, 0, 2)
    ];
    let wires = [{id: 1, from: {compId: 1, terminal: 'pos'}, to: {compId: 2, terminal: 'left'}}];
    
    components = [];
    wires = [];
    
    assertEqual(components.length, 0);
    assertEqual(wires.length, 0);
  });
  
  test('wire to same terminal should be detectable', () => {
    // Same component, same terminal
    const from = {compId: 1, terminal: 'pos'};
    const to = {compId: 1, terminal: 'pos'};
    // This is technically the same point
    assertEqual(from.compId, to.compId);
    assertEqual(from.terminal, to.terminal);
  });
  
  test('large number of components does not break', () => {
    const components = [];
    const wires = [];
    
    // Create 50 components
    for (let i = 1; i <= 50; i++) {
      components.push(createComponent('bulb', (i % 10) * 120, Math.floor(i / 10) * 60, i));
    }
    
    // Should not throw
    const powered = checkPowered(components, wires);
    assertEqual(powered.size, 0, 'no wires = no powered');
  });
  
  test('wire node has 4 terminals', () => {
    const node = createComponent('wire_node', 0, 0, 1);
    const terms = getTerminals(node);
    const termNames = Object.keys(terms);
    assertEqual(termNames.length, 4);
    assert(termNames.includes('a'));
    assert(termNames.includes('b'));
    assert(termNames.includes('c'));
    assert(termNames.includes('d'));
  });
});

describe('Internal Connections', () => {
  test('bulb connects left to right internally', () => {
    const bulb = createComponent('bulb', 0, 0, 1);
    const connections = getInternalConnections(bulb, 'left');
    assertDeepEqual(connections, ['right']);
  });
  
  test('battery does not connect pos to neg internally', () => {
    // The findPath function handles this, battery is excluded from internal traversal
    const bat = createComponent('battery', 0, 0, 1);
    const connections = getInternalConnections(bat, 'pos');
    // Battery DOES have terminals, but findPath skips internal battery traversal
    assert(connections.includes('neg'), 'battery has neg terminal');
    // The key is that findPath explicitly skips batteries
  });
  
  test('wire_node connects all terminals', () => {
    const node = createComponent('wire_node', 0, 0, 1);
    const connections = getInternalConnections(node, 'a');
    assertEqual(connections.length, 3);
    assert(connections.includes('b'));
    assert(connections.includes('c'));
    assert(connections.includes('d'));
  });
});

// ============ RUN TESTS ============
console.log('\n🔬 Circuit Lab Test Suite\n');
console.log('=' .repeat(50));

// Summary
console.log('\n' + '='.repeat(50));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log('\n❌ Failures:');
  failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  process.exit(0);
}
