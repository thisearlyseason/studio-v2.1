'use strict';
// Local experimental hardening; NOT an upstream release or audit exemption.
// Direct ASTs must be stable plain data, with ordinary dense child arrays.
const { isProxy } = require('util').types;
const MAX_DEPTH = 100;
const scalarFields = ['type', 'value', 'invalid', 'dollar', 'commas', 'ranges', 'open', 'close', 'isOpen', 'isClose'];
function invalidShape() { throw new SyntaxError('Unsupported brace AST shape'); }
function checkLevel(depth) {
  if (depth > MAX_DEPTH) throw new SyntaxError('Brace AST nesting exceeds safety limit (100)');
}
function assertDepth(ast, validateParents = false) {
  const checked = new WeakSet();
  function shape(node) {
    if (!node || typeof node !== 'object' || isProxy(node)) invalidShape();
    if (checked.has(node)) return;
    const proto = Object.getPrototypeOf(node);
    if (proto !== Object.prototype && proto !== null) invalidShape();
    const descriptors = Object.getOwnPropertyDescriptors(node);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (!('value' in descriptors[key])) invalidShape();
    }
    for (const key of scalarFields) {
      const value = node[key];
      if ((value !== null && typeof value === 'object') || typeof value === 'function') invalidShape();
    }
    for (const key of ['parent', 'prev']) {
      const value = node[key];
      if (value != null && (typeof value !== 'object' || isProxy(value))) invalidShape();
    }
    if (node.nodes !== undefined) {
      const children = node.nodes;
      if (isProxy(children) || !Array.isArray(children) || Object.getPrototypeOf(children) !== Array.prototype) invalidShape();
      const entries = Object.getOwnPropertyDescriptors(children);
      for (const key of Reflect.ownKeys(entries)) {
        if (key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= children.length)) invalidShape();
        if (!('value' in entries[key])) invalidShape();
      }
      for (let i = 0; i < children.length; i++) {
        if (!Object.hasOwn(children, i) || !children[i] || typeof children[i] !== 'object') invalidShape();
      }
    }
    checked.add(node);
  }
  shape(ast);
  const active = new Set();
  const stack = [{ node: ast, depth: 0, entered: false, index: 0 }];
  while (stack.length) {
    const frame = stack[stack.length - 1];
    if (!frame.entered) {
      shape(frame.node);
      if (frame.node.prev != null) shape(frame.node.prev);
      if (active.has(frame.node)) throw new SyntaxError('Cyclic brace AST nodes are unsupported');
      checkLevel(frame.depth);
      if (validateParents) {
        const parents = new Set(); let parent = frame.node.parent, count = 0;
        while (parent != null) {
          shape(parent);
          if (parents.has(parent)) throw new SyntaxError('Cyclic brace AST parents are unsupported');
          parents.add(parent);
          if (++count > MAX_DEPTH + 1) throw new SyntaxError('Brace AST parent chain exceeds safety limit (101 including root)');
          parent = parent.parent;
        }
      }
      active.add(frame.node); frame.entered = true;
    }
    const children = frame.node.nodes || [];
    if (frame.index === children.length) { active.delete(frame.node); stack.pop(); continue; }
    const child = children[frame.index++];
    shape(child);
    stack.push({node: child, depth: frame.depth + (child.nodes ? 1 : 0), entered: false, index: 0});
  }
}
module.exports = { MAX_DEPTH, checkLevel, assertDepth };
