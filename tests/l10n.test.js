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
    assert.equal(translate('number', { val: [
      12345,
      { style: 'currency', currency: 'USD' },
    ] }, 'en'), 'Number: $12,345.00');
  });

  await test('Intl.DateTimeFormat', () => {
    assert.equal(translate('date', { val: [
      new Date('2021-01-01'),
      { dateStyle: 'full' },
    ] }, 'en'), 'Date: Friday, January 1, 2021');
  });
});
