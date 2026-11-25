// Positions are one-based in Annex 5 of the VAT electronic filing guidelines.
function mediaIndex(source, client) {
  if (!/^(?!00000000)\d{8}$/.test(client)) throw Error('請輸入本次登帳客戶的八碼統編。');
  const lines = source.replace(/^\uFEFF/, '').split(/\r\n|\n/);
  if (lines.at(-1) === '') lines.pop();
  if (!lines.length) throw Error('媒體檔沒有資料。');
  const index = new Map();
  for (const [i, line] of lines.entries()) {
    if (!/^[\x20-\x7e]{81}$/.test(line)) throw Error('第 '+(i+1)+' 列長度或編碼錯誤，請選每列 81 位元組的原始檔。');
    const code = line.slice(0,2), number = line.slice(39,49);
    const date = line.slice(18,23);
    if (!/^\d{3}(0[1-9]|1[0-2])$/.test(date)) throw Error('第 '+(i+1)+' 列的開立年月無效。');
    const month = (1911+Number(date.slice(0,3)))+'-'+date.slice(3);
    const key = month+'|'+number;
    const buyer = line.slice(23,31), seller = line.slice(31,39);
    const sales = line.slice(49,61), tax = line.slice(62,72);
    const input = code==='21' || code==='25';
    const supported = input || code==='31' || code==='35';
    const valid = supported && /^[A-Z]{2}\d{8}$/.test(number) && !number.startsWith('BB') &&
      line[79]===' ' && /^[123]$/.test(line[61]) &&
      /^(?!00000000)\d{8}$/.test(buyer) && /^(?!00000000)\d{8}$/.test(seller) &&
      (input ? buyer : seller)===client && /^\d{12}$/.test(sales) && /^\d{10}$/.test(tax) &&
      (line[61]==='1' || Number(tax)===0);
    index.set(key,valid && !index.has(key) ? {buyer,seller,total:Number(sales)+Number(tax)} : null);
  }
  return index;
}
function mediaCheck(index, row) {
  const record = index.get(row[1].slice(0,7)+'|'+row[0]);
  if (!record) return '媒體檔沒有可唯一核對的單筆資料，請檢查客戶、年月、號碼及憑證狀態。';
  const errors = [];
  if (record.buyer !== row[4]) errors.push('買方統編');
  if (record.seller !== row[3]) errors.push('賣方統編');
  if (row[2]==='' || Number(row[2])!==record.total) errors.push('含稅總額');
  return errors.length ? '與媒體檔不符：'+errors.join('、')+'。請對照原票。' : '';
}
