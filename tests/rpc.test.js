import { createServer } from 'node:http';
import { basename, dirname } from 'node:path';
import { parse } from 'node:url';
import { Readable } from 'node:stream';

import { suite, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rpc } from '../dist/neux.esm.js';

suite('rpc', () => {
  const handlers = {
    async echo(data) {
      return data;
    },
  };

  const server = createServer((req, res) => {
    const pathname = parse(req.url).pathname;
    const dir = dirname(pathname);
    const method = basename(pathname);
    const handler = handlers[method];
    if (req.method === 'POST' && dir === '/api/rpc' && handler) {
      const chunks = [];
      req.on('data', (chunk) => {
        chunks.push(chunk);
      });
      req.on('end', async () => {
        let params;
        try {
          const buffer = Buffer.concat(chunks);
          const contentType = req.headers['content-type'];
          if (/^application\/json/u.test(contentType)) {
            params = JSON.parse(buffer.toString('utf8'));
          }
          else if (/^application\/octet-stream/u.test(contentType)) {
            params = buffer;
          }
          else {
            params = buffer.toString('utf8');
          }
          const data = await handler(params);
          if (data instanceof Readable) {
            res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
            data.on('error', () => res.end());
            return data.pipe(res);
          }
          if (Buffer.isBuffer(data)) {
            res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
            return res.end(data);
          }
          if (typeof data === 'object') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(data));
          }
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(`${data}`);
        }
        catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`${err.message}\n`);
        }
      });
    }
    else {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request\n');
    }
  },
  ).listen(0);

  after(() => server.close());

  const url = `http://localhost:${server.address().port}/api/rpc`;
  const api = rpc(url);

  test('text', async () => {
    const text = 'Hello Joe!';
    const res = await api.echo(text);
    assert.equal(res, text);
  });

  test('json', async () => {
    const json = { message: 'Hello Joe!' };
    const res = await api.echo(json);
    assert.deepEqual(res, json);
  });

  test('blob', async () => {
    const data = new Blob(['Hello Joe!']);
    const res = await api.echo(data);
    assert.deepEqual(await res.arrayBuffer(), await data.arrayBuffer());
  });

  test('file', async () => {
    const blob = new Blob(['Hello Joe!']);
    const file = new File([blob], 'hello.txt');
    const res = await api.echo(file);
    assert.deepEqual(await res.arrayBuffer(), await file.arrayBuffer());
  });
});
