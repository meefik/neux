import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { l10n } from '../dist/neux.esm.js';

suite('l10n', () => {
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

  test('default locale', () => {
    assert.equal(translate('say.hello', { name: 'Joe' }), 'Привет Joe!');
  });

  test('change locale', () => {
    assert.equal(translate('say.hello', { name: 'Joe' }, 'en'), 'Hello Joe!');
  });

  test('unknown locale', () => {
    assert.equal(translate('say.hello', { name: 'Joe' }, 'fr'), 'Hello Joe!');
  });

  test('unknown key', () => {
    assert.equal(translate('say.hi'), undefined);
  });

  test('Intl.NumberFormat', () => {
    assert.equal(translate('number', { val: [
      12345,
      { style: 'currency', currency: 'USD' },
    ] }, 'en'), 'Number: $12,345.00');
  });

  test('Intl.DateTimeFormat', () => {
    assert.equal(translate('date', { val: [
      new Date('2021-01-01'),
      { dateStyle: 'full' },
    ] }, 'en'), 'Date: Friday, January 1, 2021');
  });
});
