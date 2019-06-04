/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const assert = require('assert');
const Util = require('../../../../report/html/renderer/util.js');
const sampleResult = require('../../../results/sample_v2.json');

const NBSP = '\xa0';

/* eslint-env jest */
/* eslint-disable no-console */
/* global URL */

describe('util helpers', () => {
  let origConsoleWarn;
  let consoleWarnCalls;

  beforeEach(() => {
    origConsoleWarn = console.warn;
    consoleWarnCalls = [];
    console.warn = msg => consoleWarnCalls.push(msg);
  });

  afterEach(() => {
    console.warn = origConsoleWarn;
  });

  it('formats a number', () => {
    assert.strictEqual(Util.formatNumber(10), '10');
    assert.strictEqual(Util.formatNumber(100.01), '100');
    assert.strictEqual(Util.formatNumber(13000.456), '13,000.5');
  });

  it('formats a date', () => {
    const timestamp = Util.formatDateTime('2017-04-28T23:07:51.189Z');
    assert.ok(
      timestamp.includes('Apr 27, 2017') ||
      timestamp.includes('Apr 28, 2017') ||
      timestamp.includes('Apr 29, 2017')
    );
  });

  it('formats bytes', () => {
    assert.equal(Util.formatBytesToKB(100), `0.1${NBSP}KB`);
    assert.equal(Util.formatBytesToKB(2000), `2${NBSP}KB`);
    assert.equal(Util.formatBytesToKB(1014 * 1024), `1,014${NBSP}KB`);
  });

  it('formats ms', () => {
    assert.equal(Util.formatMilliseconds(123), `120${NBSP}ms`);
    assert.equal(Util.formatMilliseconds(2456.5, 0.1), `2,456.5${NBSP}ms`);
  });

  it('formats a duration', () => {
    assert.equal(Util.formatDuration(60 * 1000), `1${NBSP}m`);
    assert.equal(Util.formatDuration(60 * 60 * 1000 + 5000), `1${NBSP}h 5${NBSP}s`);
    assert.equal(Util.formatDuration(28 * 60 * 60 * 1000 + 5000), `1${NBSP}d 4${NBSP}h 5${NBSP}s`);
  });

  // TODO: need ICU support in node on Travis/Appveyor
  it.skip('formats based on locale', () => {
    const number = 12346.858558;

    const originalLocale = Util.numberDateLocale;
    Util.setNumberDateLocale('de');
    assert.strictEqual(Util.formatNumber(number), '12.346,9');
    Util.setNumberDateLocale(originalLocale); // reset
    assert.strictEqual(Util.formatNumber(number), '12,346.9');
  });

  it.skip('uses decimal comma with en-XA test locale', () => {
    const number = 12346.858558;

    const originalLocale = Util.numberDateLocale;
    Util.setNumberDateLocale('en-XA');
    assert.strictEqual(Util.formatNumber(number), '12.346,9');
    Util.setNumberDateLocale(originalLocale); // reset
    assert.strictEqual(Util.formatNumber(number), '12,346.9');
  });

  it('calculates a score ratings', () => {
    assert.equal(Util.calculateRating(0.0), 'fail');
    assert.equal(Util.calculateRating(0.10), 'fail');
    assert.equal(Util.calculateRating(0.45), 'fail');
    assert.equal(Util.calculateRating(0.5), 'average');
    assert.equal(Util.calculateRating(0.75), 'average');
    assert.equal(Util.calculateRating(0.80), 'average');
    assert.equal(Util.calculateRating(0.90), 'pass');
    assert.equal(Util.calculateRating(1.00), 'pass');
  });

  it('builds device emulation string', () => {
    const get = opts => Util.getEmulationDescriptions(opts).deviceEmulation;
    assert.equal(get({emulatedFormFactor: 'none'}), 'No emulation');
    assert.equal(get({emulatedFormFactor: 'mobile'}), 'Emulated Nexus 5X');
    assert.equal(get({emulatedFormFactor: 'desktop'}), 'Emulated Desktop');
  });

  it('builds throttling strings when provided', () => {
    const descriptions = Util.getEmulationDescriptions({throttlingMethod: 'provided'});
    assert.equal(descriptions.cpuThrottling, 'Provided by environment');
    assert.equal(descriptions.networkThrottling, 'Provided by environment');
  });

  it('builds throttling strings when devtools', () => {
    const descriptions = Util.getEmulationDescriptions({
      throttlingMethod: 'devtools',
      throttling: {
        cpuSlowdownMultiplier: 4.5,
        requestLatencyMs: 565,
        downloadThroughputKbps: 1400.00000000001,
        uploadThroughputKbps: 600,
      },
    });

    // eslint-disable-next-line max-len
    assert.equal(descriptions.networkThrottling, '565\xa0ms HTTP RTT, 1,400\xa0Kbps down, 600\xa0Kbps up (DevTools)');
    assert.equal(descriptions.cpuThrottling, '4.5x slowdown (DevTools)');
  });

  it('builds throttling strings when simulate', () => {
    const descriptions = Util.getEmulationDescriptions({
      throttlingMethod: 'simulate',
      throttling: {
        cpuSlowdownMultiplier: 2,
        rttMs: 150,
        throughputKbps: 1600,
      },
    });

    // eslint-disable-next-line max-len
    assert.equal(descriptions.networkThrottling, '150\xa0ms TCP RTT, 1,600\xa0Kbps throughput (Simulated)');
    assert.equal(descriptions.cpuThrottling, '2x slowdown (Simulated)');
  });

  describe('#prepareReportResult', () => {
    describe('backward compatibility', () => {
      it('corrects underscored `notApplicable` scoreDisplayMode', () => {
        const clonedSampleResult = JSON.parse(JSON.stringify(sampleResult));

        let notApplicableCount = 0;
        Object.values(clonedSampleResult.audits).forEach(audit => {
          if (audit.scoreDisplayMode === 'notApplicable') {
            notApplicableCount++;
            audit.scoreDisplayMode = 'not_applicable';
          }
        });

        assert.ok(notApplicableCount > 20); // Make sure something's being tested.

        // Original audit results should be restored.
        const preparedResult = Util.prepareReportResult(clonedSampleResult);

        assert.deepStrictEqual(preparedResult.audits, sampleResult.audits);
      });

      it('corrects undefined auditDetails.type to `debugdata`', () => {
        const clonedSampleResult = JSON.parse(JSON.stringify(sampleResult));

        // Delete debugdata details types.
        let undefinedCount = 0;
        for (const audit of Object.values(clonedSampleResult.audits)) {
          if (audit.details && audit.details.type === 'debugdata') {
            undefinedCount++;
            delete audit.details.type;
          }
        }
        assert.ok(undefinedCount > 4); // Make sure something's being tested.
        assert.notDeepStrictEqual(clonedSampleResult.audits, sampleResult.audits);

        // Original audit results should be restored.
        const preparedResult = Util.prepareReportResult(clonedSampleResult);
        assert.deepStrictEqual(preparedResult.audits, sampleResult.audits);
      });

      it('corrects `diagnostic` auditDetails.type to `debugdata`', () => {
        const clonedSampleResult = JSON.parse(JSON.stringify(sampleResult));

        // Change debugdata details types.
        let diagnosticCount = 0;
        for (const audit of Object.values(clonedSampleResult.audits)) {
          if (audit.details && audit.details.type === 'debugdata') {
            diagnosticCount++;
            audit.details.type = 'diagnostic';
          }
        }
        assert.ok(diagnosticCount > 4); // Make sure something's being tested.
        assert.notDeepStrictEqual(clonedSampleResult.audits, sampleResult.audits);

        // Original audit results should be restored.
        const preparedResult = Util.prepareReportResult(clonedSampleResult);
        assert.deepStrictEqual(preparedResult.audits, sampleResult.audits);
      });

      it('corrects screenshots in the `filmstrip` auditDetails.type', () => {
        const clonedSampleResult = JSON.parse(JSON.stringify(sampleResult));

        // Strip filmstrip screenshots of data URL prefix.
        let filmstripCount = 0;
        for (const audit of Object.values(clonedSampleResult.audits)) {
          if (audit.details && audit.details.type === 'filmstrip') {
            filmstripCount++;
            for (const screenshot of audit.details.items) {
              screenshot.data = screenshot.data.slice('data:image/jpeg;base64,'.length);
            }
          }
        }
        assert.ok(filmstripCount > 0); // Make sure something's being tested.
        assert.notDeepStrictEqual(clonedSampleResult.audits, sampleResult.audits);

        // Original audit results should be restored.
        const preparedResult = Util.prepareReportResult(clonedSampleResult);
        assert.deepStrictEqual(preparedResult.audits, sampleResult.audits);
      });
    });

    it('appends stack pack descriptions to auditRefs', () => {
      const clonedSampleResult = JSON.parse(JSON.stringify(sampleResult));
      const iconDataURL = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"%3E%3C/svg%3E';
      clonedSampleResult.stackPacks = [{
        id: 'snackpack',
        title: 'SnackPack',
        iconDataURL,
        descriptions: {
          'unused-css-rules': 'Consider using snacks in packs.',
        },
      }];
      const preparedResult = Util.prepareReportResult(clonedSampleResult);

      const perfAuditRefs = preparedResult.categories.performance.auditRefs;
      const unusedCssRef = perfAuditRefs.find(ref => ref.id === 'unused-css-rules');
      assert.deepStrictEqual(unusedCssRef.stackPacks, [{
        title: 'SnackPack',
        iconDataURL,
        description: 'Consider using snacks in packs.',
      }]);

      // No stack pack on audit wth no stack pack.
      const interactiveRef = perfAuditRefs.find(ref => ref.id === 'interactive');
      assert.strictEqual(interactiveRef.stackPacks, undefined);
    });
  });

  describe('getTld', () => {
    it('returns the correct tld', () => {
      assert.equal(Util.getTld('example.com'), '.com');
      assert.equal(Util.getTld('example.co.uk'), '.co.uk');
      assert.equal(Util.getTld('example.com.br'), '.com.br');
      assert.equal(Util.getTld('example.tokyo.jp'), '.jp');
    });
  });

  describe('getRootDomain', () => {
    it('returns the correct rootDomain from a string', () => {
      assert.equal(Util.getRootDomain('https://www.example.com/index.html'), 'example.com');
      assert.equal(Util.getRootDomain('https://example.com'), 'example.com');
      assert.equal(Util.getRootDomain('https://www.example.co.uk'), 'example.co.uk');
      assert.equal(Util.getRootDomain('https://example.com.br/app/'), 'example.com.br');
      assert.equal(Util.getRootDomain('https://example.tokyo.jp'), 'tokyo.jp');
      assert.equal(Util.getRootDomain('https://sub.example.com'), 'example.com');
      assert.equal(Util.getRootDomain('https://sub.example.tokyo.jp'), 'tokyo.jp');
      assert.equal(Util.getRootDomain('http://localhost'), 'localhost');
      assert.equal(Util.getRootDomain('http://localhost:8080'), 'localhost');
    });

    it('returns the correct rootDomain from an URL object', () => {
      assert.equal(Util.getRootDomain(new URL('https://www.example.com/index.html')), 'example.com');
      assert.equal(Util.getRootDomain(new URL('https://example.com')), 'example.com');
      assert.equal(Util.getRootDomain(new URL('https://www.example.co.uk')), 'example.co.uk');
      assert.equal(Util.getRootDomain(new URL('https://example.com.br/app/')), 'example.com.br');
      assert.equal(Util.getRootDomain(new URL('https://example.tokyo.jp')), 'tokyo.jp');
      assert.equal(Util.getRootDomain(new URL('https://sub.example.com')), 'example.com');
      assert.equal(Util.getRootDomain(new URL('https://sub.example.tokyo.jp')), 'tokyo.jp');
      assert.equal(Util.getRootDomain(new URL('http://localhost')), 'localhost');
      assert.equal(Util.getRootDomain(new URL('http://localhost:8080')), 'localhost');
    });
  });
});
