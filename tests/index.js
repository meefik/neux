import './signal.test.js';
import './render.test.js';
import './mount.test.js';
import './l10n.test.js';
import './rpc.test.js';

import { JSDOM } from 'jsdom';

const { window } = new JSDOM('', {
  url: 'http://localhost',
  contentType: 'text/html',
});
global.window = window;
