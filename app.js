const $=s=>document.querySelector(s), msg=t=>$('#msg').textContent=t;
const labels=['發票號碼','開立日期','總金額（元）','賣方統編','買方統編'];
const fields=labels.map((name,i)=>{const label=document.createElement('label'),input=document.createElement('input');label.textContent=name;input.required=true;input.type=['text','date','number','text','text'][i];if(i===0)input.pattern='[A-Z]{2}[0-9]{8}';if(i>=3)input.pattern='[0-9]{8}';if(i===4)input.placeholder='請對照原票填寫';if(i===2)input.min=0;label.append(input);$('.grid').append(label);return input});
function parse(raw){
 const m=/^([A-Z]{2}\d{8})(\d{3})(\d{2})(\d{2})\d{4}[\da-fA-F]{8}([\da-fA-F]{8})(\d{8})(\d{8})/.exec(raw);
 if(!m)return null;
 const date=(1911+Number(m[2]))+'-'+m[3]+'-'+m[4],d=new Date(date+'T00:00:00Z');
 if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==date)return null;
 return [m[1],date,parseInt(m[5],16),m[7],m[6]==='00000000'?'':m[6]];
}
const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true}),video=$('video');
function decode(img,x,y,w,h){const scale=Math.min(1,1400/Math.max(w,h));canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));ctx.drawImage(img,x,y,w,h,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);return parse(jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'dontInvert'})?.data||'')}
function read(img,w,h){return decode(img,0,0,w,h)||decode(img,0,0,w*.6,h)||decode(img,0,h*.35,w*.65,h*.65)}
let run=0,stream,timer;
function stop(){run++;clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;$('#camera').hidden=true}
function show(row){stop();$('#verified').checked=false;fields.forEach((f,i)=>f.value=row[i]);$('#review').hidden=false;msg('已讀取發票，請核對後儲存。');$('#review').scrollIntoView({block:'nearest'})}
$('#scan').onclick=async()=>{stop();const id=run;clearSource();$('#review').hidden=true;try{const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false});if(id!==run){s.getTracks().forEach(t=>t.stop());return}stream=s;video.srcObject=s;$('#camera').hidden=false;await video.play();msg('請將左側 QR Code 移到畫面中央。');function tick(){if(id!==run)return;if(video.readyState>=2){const row=read(video,video.videoWidth,video.videoHeight);if(row)return show(row)}timer=setTimeout(tick,220)}tick()}catch{if(id===run){stop();msg('無法開啟相機，請允許使用相機，或選擇照片。')}}};
$('#stop').onclick=()=>{stop();msg('已關閉相機。')};window.addEventListener('pagehide',stop);
$('#upload').onclick=()=>{stop();$('#file').click()};async function openPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    return image;
  } catch (error) {
    if (/\.hei[cf]$/i.test(file.name) || /image\/hei[cf]/i.test(file.type)) {
      const { heicTo } = await import('./heic.mjs');
      return await heicTo({blob: file, type: 'bitmap'});
    }
    if (window.createImageBitmap) return await createImageBitmap(file);
    throw error;
  } finally {
    URL.revokeObjectURL(url);
  }
}
function clearSource() {
  $('#original').hidden = true;
  $('#sourceText').textContent = '';
}
$('form').addEventListener('input', event => {
  if (event.target !== $('#verified')) $('#verified').checked = false;
});
$('#file').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  const id = ++run;
  event.target.value = '';
  $('#review').hidden = true;
  msg('正在讀取照片…');
  clearSource();
  if (/\.txt$/i.test(file.name)) {
    try {
      const source = await file.text();
      if (id !== run) return;
      $('#sourceText').textContent = source;
      show(extractFields(source));
      msg('已帶入文字檔。請對照原發票核對，未確認的欄位請手動填寫。');
    } catch {
      if (id === run) msg('文字檔讀取失敗，請重新選擇 UTF-8 TXT。');
    }
    return;
  }
  let image;
  try {
    image = await openPhoto(file);
  } catch {
    if (id === run) msg('照片無法開啟。可將發票照片截圖，再選取截圖。');
    return;
  }
  try {
    if (id !== run) return;
    if (typeof jsQR !== 'function') {
      msg('QR 掃描元件載入失敗，請重新整理頁面。');
      return;
    }
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const preview = $('#original');
    const scale = Math.min(1, 3000 / Math.max(width, height));
    preview.width = Math.max(1, Math.round(width * scale));
    preview.height = Math.max(1, Math.round(height * scale));
    preview.getContext('2d').drawImage(image, 0, 0, preview.width, preview.height);
    preview.hidden = false;
    const row = readPhotoQR(image, width, height);
    if (row) return show(row);
    msg('未讀到條碼，正在啟動文字辨識…');
    try {
      await recognizePhoto(image, width, height, id);
    } catch {
      if (id !== run) return;
      show(['','','','','']);
      msg('文字辨識無法完成。請對照原發票填寫，或重新選擇照片。');
    }
  } catch {
    msg('照片已開啟，但掃描失敗。請裁切至左側 QR Code 再試一次。');
  } finally {
    image.close?.();
  }
};
const key='invoice-pocket-v1',records=()=>JSON.parse(localStorage.getItem(key)||'[]');
function render(){const rows=records();$('#list').replaceChildren();$('#download').disabled=!rows.length;if(!rows.length){const p=document.createElement('div');p.className='empty';p.textContent='尚無紀錄，掃描第一張發票即可開始。';$('#list').append(p)}for(const [num,date,total,s,b] of rows){const el=document.createElement('div'),line=document.createElement('strong'),meta=document.createElement('small');el.className='record';line.textContent=num+'　NT$ '+Number(total).toLocaleString();meta.textContent=date+'　賣方 '+s+'　買方 '+(b||'未填寫');el.append(line,document.createElement('br'),meta);$('#list').append(el)}}
let activeMedia = null, mediaRequired = false, mediaVersion = 0;
function resetMedia(required) {
  mediaVersion++;
  mediaRequired = required;
  activeMedia = null;
  $('#verified').checked = false;
}
$('#clientId').oninput = () => {
  resetMedia(true);
  $('#mediaFile').value = '';
  $('#mediaStatus').textContent = '請載入這個客戶的媒體檔後再儲存。';
};
$('#clearMedia').onclick = () => {
  resetMedia(false);
  $('#mediaFile').value = '';
  $('#mediaStatus').textContent = '已結束媒體核對，現在使用原票人工核對。';
};
$('#mediaFile').onchange = async event => {
  resetMedia(true);
  const version = mediaVersion, file = event.target.files[0];
  $('#mediaStatus').textContent = '正在讀取媒體檔。';
  try {
    if (!file) throw Error('請選擇媒體檔。');
    const source = await file.text();
    if (version !== mediaVersion) return;
    activeMedia = mediaIndex(source, $('#clientId').value.trim());
    $('#mediaStatus').textContent = '已啟用媒體核對：'+file.name+'。掃描後須符合檔案資料才能儲存。';
  } catch (error) {
    if (version === mediaVersion) $('#mediaStatus').textContent = error.message;
  }
};
$('form').onsubmit=e=>{e.preventDefault();const row=fields.map(f=>f.value);if (!/^[0-9]{8}$/.test(row[4])) return msg('缺少完整買方統編，無法儲存。');if (!$('#verified').checked || !$('form').reportValidity()) return;if (!/^\d+$/.test(row[2]) || !Number.isSafeInteger(Number(row[2]))) return msg('請輸入完整的新臺幣整數總額。');if (row.slice(3).includes('00000000')) return msg('請核對統編，不能以八個零代填。');if (mediaRequired) {const error = activeMedia ? mediaCheck(activeMedia,row) : "請先載入有效的媒體檔。";if (error) return msg(error);}row[2]=Number(row[2]);try{const rows=records();if(rows.some(r=>r[0]===row[0]&&r[1].slice(0,4)===row[1].slice(0,4)))return msg('這張發票已經登錄。');localStorage.setItem(key,JSON.stringify([row,...rows]));render();$('#review').hidden=true;msg('已儲存發票。')}catch{msg('儲存失敗，請確認瀏覽器允許本機儲存。')}};
$('#cancel').onclick=()=>{$('#review').hidden=true;msg('已取消登錄。')};
$('#download').onclick=()=>{const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet([labels,...records()]);ws['!cols']=labels.map(()=>({wch:18}));XLSX.utils.book_append_sheet(wb,ws,'發票紀錄');XLSX.writeFile(wb,'發票紀錄.xlsx')};render();
