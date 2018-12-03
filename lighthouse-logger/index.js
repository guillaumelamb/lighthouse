/**
 * @license Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const debug = require('debug');
// @ts-ignore
const marky = require('marky');
const EventEmitter = require('events').EventEmitter;

/**
 * @template {Function} F
 * @typedef {import('./helpers').ArgumentTypes<F>} ArgumentTypes
 */

/**
 * @template T
 * @typedef {import('./helpers').IsFunction<T>} IsFunction
 */

/**
 * @template Class
 * @template {*[]} Args
 * @typedef {{
 *  msg: string | ((this: Class, ...args: Args) => string),
 *  id?: string | ((this: Class, ...args: Args) => string),
 *  timeStartLogLevel?: LogAction,
 *  timeEndLogLevel?: LogAction,
 * }} TimeDecorateOpts
 */

/**
 * @typedef {'verbose'|'error'|'silent'|'log'|'info'|'warn'} LogLevel
 */
/**
 * @typedef {LogLevel & keyof typeof Log} LogAction
 */

/**
 * @typedef {{
 *   msg:string,
 *   id: string,
 *   args?: any[],
 * }} Status
 */

/**
 * @typedef {[any, ...any[]]} ArrayAtLeastOne
 */

const isWindows = process.platform === 'win32';

// process.browser is set when browserify'd via the `process` npm module
// @ts-ignore
const isBrowser = process.browser;

const colors = {
  red: isBrowser ? 'crimson' : 1,
  yellow: isBrowser ? 'gold' : 3,
  cyan: isBrowser ? 'darkturquoise' : 6,
  green: isBrowser ? 'forestgreen' : 2,
  blue: isBrowser ? 'steelblue' : 4,
  magenta: isBrowser ? 'palevioletred' : 5,
};

// whitelist non-red/yellow colors for debug()
// @ts-ignore
debug.colors = [colors.cyan, colors.green, colors.blue, colors.magenta];

class Emitter extends EventEmitter {
  /**
   * Fires off all status updates. Listen with
   * `require('lib/log').events.addListener('status', callback)`
   * @param {string} title
   * @param {!Array<*>} argsArray
   */
  issueStatus(title, argsArray) {
    if (title === 'status' || title === 'statusEnd') {
      this.emit(title, [title, ...argsArray]);
    }
  }

  /**
   * Fires off all warnings. Listen with
   * `require('lib/log').events.addListener('warning', callback)`
   * @param {string} title
   * @param {!Array<*>} argsArray
   */
  issueWarning(title, argsArray) {
    this.emit('warning', [title, ...argsArray]);
  }
}

/** @type {{[k: string] : debug.IDebugger}} */
const loggersByTitle = {};

const loggingBufferColumns = 25;

/** @type {LogLevel} */
let level_;

class Log {
  /**
   * @param {string} title
   * @param {ArrayAtLeastOne} argsArray
   */
  static _logToStdErr(title, argsArray) {
    const log = Log.loggerfn(title);
    log(...argsArray);
  }

  /**
   * @param {string} title
   */
  static loggerfn(title) {
    let log = loggersByTitle[title];
    if (!log) {
      log = debug(title);
      loggersByTitle[title] = log;
      // errors with red, warnings with yellow.
      if (title.endsWith('error')) {
        // @ts-ignore
        log.color = colors.red;
      } else if (title.endsWith('warn')) {
        // @ts-ignore
        log.color = colors.yellow;
      }
    }
    return log;
  }

  /**
   * @param {LogLevel} level
   */
  static setLevel(level) {
    level_ = level;
    switch (level) {
      case 'silent':
        debug.enable('-*');
        break;
      case 'verbose':
        debug.enable('*');
        break;
      case 'error':
        debug.enable('-*, *:error');
        break;
      default:
        debug.enable('*, -*:verbose');
    }
  }

  /**
   * A simple formatting utility for event logging.
   * @param {string} prefix
   * @param {!Object} data A JSON-serializable object of event data to log.
   * @param {LogLevel=} level Optional logging level. Defaults to 'log'.
   */
  static formatProtocol(prefix, data, level) {
    const columns = isBrowser ? Infinity : (process.stdout.columns || Infinity);
    const method = data.method || '?????';
    const maxLength = columns - method.length - prefix.length - loggingBufferColumns;
    // IO.read blacklisted here to avoid logging megabytes of trace data
    const snippet = (data.params && method !== 'IO.read') ?
      JSON.stringify(data.params).substr(0, maxLength) : '';
    Log._logToStdErr(`${prefix}:${level || ''}`, [method, snippet]);
  }

  /**
   * @return {boolean}
   */
  static isVerbose() {
    return level_ === 'verbose';
  }

  /**
   * @param {Status} param0
   * @param {LogAction} level
   */
  static time({msg, id, args = []}, level = 'log') {
    marky.mark(id);
    Log[level]('status', msg, ...args);
  }

  /**
   * @param {Status} param0
   * @param {LogAction} level
   */
  static timeEnd({msg, id, args = []}, level = 'verbose') {
    Log[level]('statusEnd', msg, ...args);
    marky.stop(id);
  }

  /* eslint-disable no-invalid-this */
  /**
   * Decorates a function, calling time/timeEnd before/after calling the original function.
   * @template T, R
   * @template {*[]} Args
   * @param {(this: T, ...args: Args) => R} originalFn
   * @param {TimeDecorateOpts<T, Args>} opts
   * @return {(this: T, ...args: Args) => R}
   */
  static timeDecorate(originalFn, opts) {
    /**
     * @type {(this: *, ...args: *[]) => string}
     */
    const computeMsg = (_this, args) => {
      let msg = '';
      if (typeof opts.msg === 'string') {
        msg = opts.msg;
      } else if (typeof opts.msg === 'function') {
        // TODO turn on --strictBindCallApply when tsc is upgraded to 3.2
        msg = opts.msg.apply(_this, args);
      }
      if (!msg) {
        throw new Error('expected msg');
      }
      return msg;
    };

    /**
     * @type {(this: *, ...args: *[]) => string}
     */
    const computeId = (_this, args) => {
      let id = '';
      if (typeof opts.id === 'string') {
        id = opts.id;
      } else if (typeof opts.id === 'function') {
        // TODO turn on --strictBindCallApply when tsc is upgraded to 3.2
        id = opts.id.apply(this, args);
      } else {
        id = `lh:${originalFn.name}`;
      }
      if (!id) {
        throw new Error('expected id');
      }
      return id;
    };

    /**
     * @type {(this: T, ...args: Args) => R}
     */
    const fn = function timeDecoratedFn(...args) {
      const timeStartLogLevel = opts.timeStartLogLevel || 'log';
      const timeEndLogLevel = opts.timeEndLogLevel || 'verbose';

      const status = {msg: computeMsg(this, args), id: computeId(this, args)};
      Log.time(status, timeStartLogLevel);

      let result;
      try {
        result = originalFn.apply(this, args);
      } catch (err) {
        Log.timeEnd(status, timeEndLogLevel);
        err.stack = err.stack.replace(/.* at timeDecoratedFn .*\n/g, '');
        throw err;
      }

      if (result && typeof result.then === 'function') {
        return result.then((/** @type {any} */ value) => {
          Log.timeEnd(status, timeEndLogLevel);
          return value;
        }).catch((/** @type {any} */ err) => {
          Log.timeEnd(status, timeEndLogLevel);
          err.stack = err.stack.replace(/.* at timeDecoratedFn .*\n/, '');
          throw err;
        });
      } else {
        Log.timeEnd(status, timeEndLogLevel);
        return result;
      }
    };
    return fn;
  }
  /* eslint-enable no-invalid-this */

  /**
   * Decorates (like timeDecorate) specified methods of a class.
   * If decorating instance methods, use the class's prototype.
   * If decorating static methods, use the class directly.
   * @template {Object|Function} Class
   * @template {keyof Class} Prop
   * @param {Class} klass
   * @param {{[key in Prop]: TimeDecorateOpts<Class, ArgumentTypes<IsFunction<Class[key]>>>}} methods
   */
  static timeDecorateClass(klass, methods) {
    for (const [method, opts] of Object.entries(methods)) {
      if (!opts.id) {
        const className = (typeof klass === 'function' ? klass : klass.constructor).name;
        opts.id = `lh:${className}:${method}`;
      }
      /** @type {IsFunction<Class[typeof method]>} */
      const original = klass[method];
      if (!original) {
        throw new Error('Cannot decorate non-existent method ${method}');
      }
      klass[method] = Log.timeDecorate(original, opts);
    }
  }

  /**
   * @param {string} title
   * @param {ArrayAtLeastOne} args
   */
  static log(title, ...args) {
    Log.events.issueStatus(title, args);
    Log._logToStdErr(title, args);
  }

  /**
   * @param {string} title
   * @param {ArrayAtLeastOne} args
   */
  static warn(title, ...args) {
    Log.events.issueWarning(title, args);
    Log._logToStdErr(`${title}:warn`, args);
  }

  /**
   * @param {string} title
   * @param {ArrayAtLeastOne} args
   */
  static error(title, ...args) {
    Log._logToStdErr(`${title}:error`, args);
  }

  /**
   * @param {string} title
   * @param {ArrayAtLeastOne} args
   */
  static verbose(title, ...args) {
    Log.events.issueStatus(title, args);
    Log._logToStdErr(`${title}:verbose`, args);
  }

  /**
   * Add surrounding escape sequences to turn a string green when logged.
   * @param {string} str
   * @return {string}
   */
  static greenify(str) {
    return `${Log.green}${str}${Log.reset}`;
  }

  /**
   * Add surrounding escape sequences to turn a string red when logged.
   * @param {string} str
   * @return {string}
   */
  static redify(str) {
    return `${Log.red}${str}${Log.reset}`;
  }

  static get green() {
    return '\x1B[32m';
  }

  static get red() {
    return '\x1B[31m';
  }

  static get yellow() {
    return '\x1b[33m';
  }

  static get purple() {
    return '\x1b[95m';
  }

  static get reset() {
    return '\x1B[0m';
  }

  static get bold() {
    return '\x1b[1m';
  }

  static get dim() {
    return '\x1b[2m';
  }

  static get tick() {
    return isWindows ? '\u221A' : '✓';
  }

  static get cross() {
    return isWindows ? '\u00D7' : '✘';
  }

  static get whiteSmallSquare() {
    return isWindows ? '\u0387' : '▫';
  }

  static get heavyHorizontal() {
    return isWindows ? '\u2500' : '━';
  }

  static get heavyVertical() {
    return isWindows ? '\u2502 ' : '┃ ';
  }

  static get heavyUpAndRight() {
    return isWindows ? '\u2514' : '┗';
  }

  static get heavyVerticalAndRight() {
    return isWindows ? '\u251C' : '┣';
  }

  static get heavyDownAndHorizontal() {
    return isWindows ? '\u252C' : '┳';
  }

  static get doubleLightHorizontal() {
    return '──';
  }

  /**
   * @return {PerformanceEntry[]}
   */
  static takeTimeEntries() {
    const entries = marky.getEntries();
    marky.clear();
    return entries;
  }

  /**
   * @return {PerformanceEntry[]}
   */
  static getTimeEntries() {
    return marky.getEntries();
  }
}

Log.events = new Emitter();

module.exports = Log;
