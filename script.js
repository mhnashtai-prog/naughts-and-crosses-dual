/* script.js — INTUITY dynamic builder */
(() => {
  const essayArea = document.getElementById('essayArea');
  const previewOutput = document.getElementById('previewOutput');
  const modeToggle = document.getElementById('modeToggle');
  const previewPane = document.getElementById('previewPane');
  const floatingPanel = document.getElementById('floatingPanel');
  const toggleFloating = document.getElementById('toggleFloating');
  const floatingContent = document.getElementById('floatingContent');
  const copyBtn = document.getElementById('copyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const focusNav = document.getElementById('focusNav');
  const pillsContainer = document.getElementById('pillsContainer');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  let phrases = null;
  let currentIndex = 0;
  let textareas = {}; // id -> textarea element
  const storageKeys = { mode: 'intuity_mode', float: 'intuity_float' };

  // utility: smart insert
  function smartInsert(existing, fragment){
    if(!existing || existing.trim()==='') return fragment.trim();
    const trimmed = existing.trim();
    const last = trimmed.slice(-1);
    const frag = fragment.trim();
    if(['.', '?', '!', '—', ':'].includes(last)) return trimmed + ' ' + frag;
    if(frag.startsWith(',') || frag.startsWith(';') || frag.startsWith('.')) return trimmed + frag;
    return trimmed + ' ' + frag;
  }

  // fetch phrases.json
  fetch('phrases.json').then(r=>r.json()).then(data => {
    phrases = data;
    buildUI();
    restoreState();
    updatePreview();
    updateFloating();
  }).catch(err => {
    console.error('Failed to load phrases.json', err);
    essayArea.innerHTML = '<p style="padding:20px;color:#f66">Could not load phrase library (phrases.json). Check file path.</p>';
  });

  function buildUI(){
    essayArea.innerHTML = '';
    textareas = {};
    const order = phrases.order || Object.keys(phrases).filter(k=>k!=='order');
    order.forEach((sectionKey, idx) => {
      const section = phrases[sectionKey];
      const sec = document.createElement('section');
      sec.className = 'paragraph';
      sec.id = sectionKey;
      sec.dataset.index = idx;

      // header (icons)
      const header = document.createElement('div');
      header.className = 'paragraph-header';

      // mapping of category -> emoji (for visual clarity)
      const emojiMap = {
        'background':'📖','aim':'🎯','ideas':'💡',
        'listing':'📋','opinion':'💬','claim':'📝','reason':'⚡','example':'📌','result':'➡️',
        'compare':'🔗','contrast':'⚖️','final':'🌟'
      };

      // for each category in section (except default)
      Object.keys(section).forEach(cat => {
        if(cat === 'default') return;
        const btn = document.createElement('button');
        btn.className = 'icon-btn';
        btn.type = 'button';
        btn.dataset.target = `${sectionKey}__${cat}`;
        btn.title = cat;
        btn.innerText = emojiMap[cat] || '💡';
        header.appendChild(btn);

        // create dropdown container
        const dropdownDiv = document.createElement('div');
        dropdownDiv.className = 'dropdown-container';
        dropdownDiv.id = `${sectionKey}__${cat}`;

        const select = document.createElement('select');
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = `Choose ${cat}…`;
        select.appendChild(placeholder);

        (section[cat] || []).forEach(item => {
          const opt = document.createElement('option');
          opt.value = item;
          opt.textContent = item;
          select.appendChild(opt);
        });

        dropdownDiv.appendChild(select);
        sec.appendChild(dropdownDiv);
      });

      // paragraph body
      const body = document.createElement('div');
      body.className = 'paragraph-body';

      const ta = document.createElement('textarea');
      ta.id = `ta-${sectionKey}`;
      ta.value = section.default || '';
      body.appendChild(ta);

      sec.appendChild(header);
      sec.appendChild(body);
      essayArea.appendChild(sec);

      textareas[sectionKey] = ta;
    });

    // interactions after build
    attachInteractions();
    buildFocusPills();
  }

  function attachInteractions(){
    // icon toggle behavior
    document.querySelectorAll('.icon-btn').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const id = btn.dataset.target;
        const container = document.getElementById(id);
        // close others in same paragraph
        const parentParagraph = btn.closest('.paragraph');
        parentParagraph.querySelectorAll('.dropdown-container').forEach(dc=>{
          if(dc.id !== id) dc.classList.remove('show');
        });
        container.classList.toggle('show');
      });
      btn.addEventListener('keydown', ev => { if(ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); btn.click(); } });
    });

    // close on outside click
    document.addEventListener('click', () => {
      document.querySelectorAll('.dropdown-container.show').forEach(dc=>dc.classList.remove('show'));
    });

    // handle select insertion
    document.querySelectorAll('.dropdown-container select').forEach(sel=>{
      sel.addEventListener('change', ()=>{
        const val = sel.value;
        if(!val) return;
        const parentParagraph = sel.closest('.paragraph');
        const ta = parentParagraph.querySelector('textarea');
        ta.value = smartInsert(ta.value, val);
        ta.classList.add('glow');
        setTimeout(()=>ta.classList.remove('glow'),700);
        updatePreview();
        updateFloating();
        sel.selectedIndex = 0; // reset placeholder
        parentParagraph.querySelectorAll('.dropdown-container').forEach(dc=>dc.classList.remove('show'));
      });
    });

    // textarea input -> preview & floating
    Object.values(textareas).forEach(ta=>{
      ta.addEventListener('input', ()=>{
        updatePreview();
        updateFloating();
      });
    });

    // mode toggle
    modeToggle.addEventListener('change', (e)=>{
      setPerParagraph(e.target.checked);
    });

    // floating toggle / drag
    toggleFloating.addEventListener('click', ()=>{
      const sleeping = floatingPanel.classList.toggle('sleep');
      toggleFloating.textContent = sleeping ? '💤' : '📝';
      localStorage.setItem(storageKeys.float, sleeping ? 'sleep' : 'awake');
      if(!sleeping) updateFloating();
    });

    // floating panel drag
    let dragging = false, dx=0, dy=0;
    const headerEl = document.getElementById('floatingHeader');
    headerEl.addEventListener('mousedown', e=>{
      if(floatingPanel.classList.contains('sleep')) return;
      dragging = true; dx = e.clientX - floatingPanel.offsetLeft; dy = e.clientY - floatingPanel.offsetTop;
    });
    document.addEventListener('mousemove', e=>{
      if(!dragging) return;
      floatingPanel.style.left = Math.max(8, e.clientX - dx) + 'px';
      floatingPanel.style.top = Math.max(8, e.clientY - dy) + 'px';
    });
    document.addEventListener('mouseup', ()=> dragging = false);

    // floating editable -> sync back
    let typingTimer;
    floatingContent.addEventListener('input', ()=>{
      clearTimeout(typingTimer);
      typingTimer = setTimeout(()=> {
        // parse markers [INTRO] [CLAIM1] etc.
        const raw = floatingContent.innerText;
        const parts = raw.split(/\n?\[([A-Za-z0-9_ -]+)\]\n?/).filter(Boolean);
        // parts alternate: key, text, key, text...
        for(let i=0;i<parts.length;i+=2){
          const key = (parts[i] || '').trim().toLowerCase();
          const val = (parts[i+1] || '').trim();
          if(!key) continue;
          // map basic keys
          if(key.includes('intro')) textareas['introduction'].value = val;
          else if(key.includes('claim1')) textareas['claim1'].value = val;
          else if(key.includes('claim2')) textareas['claim2'].value = val;
          else if(key.includes('claim3')) textareas['claim3'].value = val;
          else if(key.includes('conclusion')) textareas['conclusion'].value = val;
        }
        updatePreview();
      }, 250);
    });

    // copy & download
    copyBtn.addEventListener('click', async ()=>{
      const txt = previewOutput.textContent;
      if(!txt.trim()) return alert('Nothing to copy.');
      try { await navigator.clipboard.writeText(txt); alert('Copied ✓'); } catch(e){ prompt('Copy the essay:', txt); }
    });
    downloadBtn.addEventListener('click', ()=>{
      const txt = previewOutput.textContent;
      if(!txt.trim()) return alert('Nothing to download.');
      const blob = new Blob([txt], {type:'text/plain;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'intuity_essay.txt'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    });

    // prev/next for per-paragraph
    prevBtn.addEventListener('click', ()=> { currentIndex = (currentIndex - 1 + orderLength()) % orderLength(); showOnly(currentIndex); updatePills(); });
    nextBtn.addEventListener('click', ()=> { currentIndex = (currentIndex + 1) % orderLength(); showOnly(currentIndex); updatePills(); });
  }

  function updatePreview(){
    const order = phrases.order;
    const parts = order.map(key => (textareas[key] && textareas[key].value.trim()) ? textareas[key].value.trim() : '').filter(Boolean);
    previewOutput.textContent = parts.join('\n\n');
  }

  function updateFloating(){
    const order = phrases.order;
    const lines = [];
    order.forEach(key=>{
      const label = key.toUpperCase();
      const val = (textareas[key] && textareas[key].value.trim()) ? textareas[key].value.trim() : '';
      lines.push(`[${label}]`);
      lines.push(val);
      lines.push('');
    });
    floatingContent.innerText = lines.join('\n').trim();
  }

  // per-paragraph mode helpers
  function setPerParagraph(flag){
    const container = document.querySelector('.essay');
    if(flag){
      container.parentElement.classList.add('per-paragraph');
      focusNav.setAttribute('aria-hidden','false');
      focusNav.classList.add('visible');
      buildFocusPills();
      currentIndex = Math.max(0, currentIndex);
      showOnly(currentIndex);
    } else {
      container.parentElement.classList.remove('per-paragraph');
      focusNav.classList.remove('visible');
      focusNav.setAttribute('aria-hidden','true');
      paragraphsShowAll();
    }
    localStorage.setItem(storageKeys.mode, flag ? 'per' : 'full');
  }

  function orderLength(){ return phrases.order.length; }

  function paragraphsShowAll(){
    document.querySelectorAll('.paragraph').forEach(p => p.style.display = 'flex');
  }

  function showOnly(idx){
    document.querySelectorAll('.paragraph').forEach((p,i)=> p.style.display = (i===idx ? 'flex' : 'none'));
  }

  function buildFocusPills(){
    pillsContainer.innerHTML = '';
    phrases.order.forEach((key, idx)=>{
      const btn = document.createElement('button');
      btn.className = 'pill' + (idx===currentIndex ? ' active' : '');
      btn.textContent = (key==='introduction') ? 'Intro' : (key==='conclusion' ? 'Conclusion' : 'Claim ' + idx);
      btn.addEventListener('click', ()=>{ currentIndex = idx; showOnly(idx); updatePills(); });
      pillsContainer.appendChild(btn);
    });
  }
  function updatePills(){ Array.from(pillsContainer.children).forEach((b,i)=> b.classList.toggle('active', i===currentIndex)); }

  function restoreState(){
    const mode = localStorage.getItem(storageKeys.mode);
    modeToggle.checked = (mode === 'per');
    if(modeToggle.checked) setPerParagraph(true);
    else setPerParagraph(false);
    const floatState = localStorage.getItem(storageKeys.float);
    if(floatState === 'awake'){ floatingPanel.classList.remove('sleep'); toggleFloating.textContent = '📝'; updateFloating(); }
    else { floatingPanel.classList.add('sleep'); toggleFloating.textContent = '💤'; }
  }

  // helper: after building UI, get all textareas reference for quick access
  function buildFocusPillsAndTextareas(){
    // already created textareas in buildUI; fill textareas mapping
    Object.keys(phrases).forEach(k=>{
      if(k === 'order') return;
      const el = document.getElementById(`ta-${k}`);
      if(el) textareas[k] = el;
    });
  }

  // build focus pills after UI ready
  function buildFocusPills(){
    // ensure textareas mapping is available
    buildFocusPillsAndTextareas();
    pillsContainer.innerHTML = '';
    phrases.order.forEach((key, idx)=>{
      const btn = document.createElement('button');
      btn.className = 'pill' + (idx===currentIndex ? ' active' : '');
      btn.textContent = (key==='introduction') ? 'Intro' : (key==='conclusion' ? 'Conclusion' : 'Claim ' + idx);
      btn.addEventListener('click', ()=>{ currentIndex = idx; showOnly(idx); updatePills(); });
      pillsContainer.appendChild(btn);
    });
  }

})();
