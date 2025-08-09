// src/tools/math.js
// Full safe math utility module

/**
 * Adds two numbers.
 */
export function add(a, b) {
  return Number(a) + Number(b);
}

/**
 * Subtracts b from a.
 */
export function subtract(a, b) {
  return Number(a) - Number(b);
}

/**
 * Multiplies two numbers.
 */
export function multiply(a, b) {
  return Number(a) * Number(b);
}

/**
 * Divides a by b. Returns null if division by zero.
 */
export function divide(a, b) {
  if (Number(b) === 0) return null;
  return Number(a) / Number(b);
}

/**
 * Averages a list of numbers.
 */
export function average(...nums) {
  if (!nums.length) return null;
  const sum = nums.reduce((acc, n) => acc + Number(n), 0);
  return sum / nums.length;
}

/**
 * Clamps a number between min and max.
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Generates a random integer between min and max (inclusive).
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Rounds a number to a given number of decimal places.
 */
export function round(value, decimals = 0) {
  return Number(Math.round(value + "e" + decimals) + "e-" + decimals);
}

/**
 * Returns the percentage of part out of total.
 */
export function percentage(part, total) {
  if (Number(total) === 0) return 0;
  return (Number(part) / Number(total)) * 100;
}

/**
 * Calculates the factorial of a number.
 */
export function factorial(n) {
  if (n < 0) return null;
  return n <= 1 ? 1 : n * factorial(n - 1);
}

/**
 * Converts degrees to radians.
 */
export function degToRad(deg) {
  return (Number(deg) * Math.PI) / 180;
}

/**
 * Converts radians to degrees.
 */
export function radToDeg(rad) {
  return (Number(rad) * 180) / Math.PI;
}

export default {
  add,
  subtract,
  multiply,
  divide,
  average,
  clamp,
  randomInt,
  round,
  percentage,
  factorial,
  degToRad,
  radToDeg,
};
