'use strict';
// Minimal multipart/form-data parser. Returns { fields:{}, files:{name:{filename,data}} }.

function parse(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) throw new Error('Missing multipart boundary');
  const boundary = Buffer.from(`--${m[1] || m[2]}`);
  const fields = {};
  const files = {};

  let pos = buf.indexOf(boundary);
  if (pos < 0) throw new Error('Malformed form data');
  pos += boundary.length;

  while (pos < buf.length) {
    if (buf[pos] === 0x2d && buf[pos + 1] === 0x2d) break; // closing "--"
    pos += 2; // skip CRLF after boundary
    const headerEnd = buf.indexOf('\r\n\r\n', pos);
    if (headerEnd < 0) break;
    const headers = buf.subarray(pos, headerEnd).toString('utf8');
    pos = headerEnd + 4;

    const next = buf.indexOf(boundary, pos);
    const bodyEnd = next < 0 ? buf.length : next - 2; // strip trailing CRLF
    const body = buf.subarray(pos, bodyEnd);
    pos = next + boundary.length;

    const nameM = /name="([^"]*)"/i.exec(headers);
    const fileM = /filename="([^"]*)"/i.exec(headers);
    if (!nameM) continue;
    const name = nameM[1];
    if (fileM) {
      if (fileM[1]) files[name] = { filename: fileM[1], data: Buffer.from(body) };
    } else {
      fields[name] = body.toString('utf8');
    }
    if (next < 0) break;
  }
  return { fields, files };
}

module.exports = { parse };
