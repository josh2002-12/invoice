function readPhotoQR(image, width, height) {
  const full = read(image, width, height);
  if (full) return full;
  // Preserve small codes on long receipts by scanning overlapping tiles.
  const side = Math.min(width, height, Math.max(700, Math.ceil(Math.max(width, height) / 5)));
  for (let y = 0; y < height; y += Math.ceil(side * .75)) {
    for (let x = 0; x < width; x += Math.ceil(side * .75)) {
      const row = decode(image, Math.min(x, width-side), Math.min(y, height-side), side, side);
      if (row) return row;
    }
  }
  return null;
}

function issueDate(text) {
  const pattern = /(?:^|[^\d])(20\d{2}|1\d{2}|09\d)\s*[-./年]\s*(\d{1,2})\s*[-./月]\s*(\d{1,2})(?!\d|\s*月)/g;
  const labeled = text.split('\n').filter(line => /開立日期|發票日期|交易日期/.test(line.replace(/\s/g,'')));
  const dates = new Set();
  for (const line of labeled.length ? labeled : text.split('\n')) {
    if (/到期|有效期限|列印日期/.test(line)) continue;
    for (const match of line.matchAll(pattern)) {
      const [,year,month,day] = match;
      const date = [year.length === 3 ? Number(year)+1911 : year, month.padStart(2,'0'), day.padStart(2,'0')].join('-');
      const parsed = new Date(date+'T00:00:00Z');
      if (Number.isFinite(+parsed) && parsed.toISOString().startsWith(date)) dates.add(date);
    }
  }
  return dates.size === 1 ? [...dates][0] : '';
}

function labeledId(text, role) {
  const label = role === 'seller' ? '(?:賣方|銷售人|開立人|營業人)' : '(?:買方|買受人)';
  const idLabel = '(?:統一編號|統編|統一號碼)';
  const digits = '[:#﹕]?\\s*(\\d{4}[- ]?\\d{4})(?!\\d)';
  const compact = text.normalize('NFKC').replace(/[^\S\n]+/g,'');
  const pattern = new RegExp(label+'\\s*(?:[（(]?'+idLabel+'[）)]?)?'+digits,'g');
  const matches = [...compact.matchAll(pattern)].map(m => m[1].replace(/\D/g,''));
  if (matches.length) return new Set(matches).size === 1 ? matches[0] : '';
  return '';
}

function extractFields(text) {
  const lines = text.normalize('NFKC').toUpperCase().split(/\r?\n/).map(line => line.replace(/\s/g, ''));
  const joined = lines.join('\n');
  const numbers = [...joined.matchAll(/(?:^|[^A-Z0-9])([A-Z]{2})[-–—]?(\d{8})(?!\d)/g)].map(m => m[1]+m[2]);
  const totals = [...joined.matchAll(/^(?:總計|總金額|應付金額|含稅合計|含稅總額|GRANDTOTAL|^TOTAL)[:：]?(?:NT\$?|新臺幣|新台幣|TWD|\$)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.00)?(?:元|圓)?$/gm)].map(m => m[1].replace(/,/g,''));
  const unique = values => new Set(values).size === 1 ? values[0] : '';
  return [unique(numbers), issueDate(text.normalize('NFKC')), unique(totals), labeledId(text,'seller'), labeledId(text,'buyer')];
}

async function recognizePhoto(image, width, height, id) {
  const surface = document.createElement('canvas');
  const scale = Math.min(1, 3000 / Math.max(width, height));
  surface.width = Math.max(1, Math.round(width*scale));
  surface.height = Math.max(1, Math.round(height*scale));
  surface.getContext('2d').drawImage(image, 0, 0, surface.width, surface.height);
  const path = name => new URL('ocr/'+name, document.baseURI).href;
  const worker = await Tesseract.createWorker('chi_tra+eng', 1, {
    workerPath: path('worker.min.js'), corePath: path('core.js'), langPath: path(''),
    workerBlobURL: false,
    logger: update => {
      if (run === id && update.status === 'recognizing text') msg('正在辨識發票文字 '+Math.round(update.progress*100)+'%');
    }
  });
  try {
    if (run !== id) return;
    const {data} = await worker.recognize(surface);
    if (run !== id) return;
    const row = extractFields(data.text);
    await worker.setParameters({tessedit_pageseg_mode: '11'});
    const retry = await worker.recognize(surface);
    if (run !== id) return;
    const recovered = extractFields(retry.data.text);
    for (let column = 0; column < row.length; column++) {
      if (row[column] !== recovered[column]) row[column] = '';
    }
    $('#sourceText').textContent = data.text;
    show(row);
    msg(!row[2] ? '總金額未能確認，請對照發票上的總計填寫。' : row.some(Boolean) ? '文字辨識完成，請對照原發票確認每個欄位。' : '讀不到清楚的欄位，請對照原發票填寫，或重拍近一點。');
  } finally {
    await worker.terminate();
  }
}
