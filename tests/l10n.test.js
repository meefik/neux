import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { l10n } from '../src/l10n.js';

suite('l10n', async () => {
  const translate = l10n({
    en: {
      say: {
        hello: 'Hello %{name}!',
      },
      number: 'Number: %{val}',
      date: 'Date: %{val}',
    },
    ru: {
      say: {
        hello: 'Привет %{name}!',
      },
      number: 'Число: %{val}',
      date: 'Дата: %{val}',
    },
  }, {
    language: 'ru',
    fallback: 'en',
  });

  await test('default locale', () => {
    assert.equal(translate('say.hello', { name: 'Joe' }), 'Привет Joe!');
  });

  await test('change locale', () => {
    assert.equal(translate('say.hello', { name: 'Joe' }, 'en'), 'Hello Joe!');
  });

  await test('unknown locale', () => {
    assert.equal(translate('say.hello', { name: 'Joe' }, 'fr'), 'Hello Joe!');
  });

  await test('unknown key', () => {
    assert.equal(translate('say.hi'), undefined);
  });

  await test('Intl.NumberFormat', () => {
    const format = { style: 'currency', currency: 'USD' };
    const value = 12345;
    const result = '$12,345.00';
    assert.equal(translate('number', { val: [value, format] }, 'en'), `Number: ${result}`);
    assert.equal(translate(value, format, 'en'), result);
  });

  await test('Intl.DateTimeFormat', () => {
    const format = { dateStyle: 'full' };
    const value = new Date('2021-01-01');
    const result = 'Friday, January 1, 2021';
    assert.equal(translate('date', { val: [value, format] }, 'en'), `Date: ${result}`);
    assert.equal(translate(value, format, 'en'), result);
  });
});
