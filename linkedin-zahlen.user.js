// ==UserScript==
// @name         Post-Studio: LinkedIn-Zahlen ins Sheet
// @namespace    phoeser.linkedin-post-studio
// @version      3.1
// @description  Liest die Beitragszahlen aus deiner eingeloggten LinkedIn-Analytics-Oberflaeche und schreibt sie als "Zahlen"-Zeilen ins Redaktions-Sheet (Post-Studio).
// @author       Paul Hoeser / Post-Studio
// @match        https://www.linkedin.com/*
// @match        https://phoeser.github.io/linkedin-post-studio/*
// @updateURL    https://phoeser.github.io/linkedin-post-studio/linkedin-zahlen.user.js
// @downloadURL  https://phoeser.github.io/linkedin-post-studio/linkedin-zahlen.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      hook.eu2.make.com
// @run-at       document-idle
// ==/UserScript==

(function(){
  'use strict';
  const HOOK='https://hook.eu2.make.com/i3pnrhkk7g4gic16mht74n1jp5gcggna', START='https://www.linkedin.com/analytics/creator/top-posts/?metricType=IMPRESSIONS&timeRange=past_28_days';
  /* Der Schluessel steht nicht in dieser Datei. Das Studio legt ihn beim Oeffnen als
     window.__STUDIO_KEY ab; von dort holen wir ihn einmal und merken ihn uns. */
  const holeKey=()=>{ try{ return GM_getValue('key','') }catch(_){ return '' } };
  const holeTab=()=>{ try{ return GM_getValue('tab','Untitled')||'Untitled' }catch(_){ return 'Untitled' } };
  const SK='studioZahlen';
  /* Tagesmerker: hoechstens ein Lauf je Kalendertag, ueberlebt Tabwechsel. */
  const heuteStr=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  const gelaufenHeute=()=>{ try{ return GM_getValue('letzterLauf','')===heuteStr() }catch(_){ return false } };
  const merkeLauf=()=>{ try{ GM_setValue('letzterLauf', heuteStr()) }catch(_){} };
  /* Wurde der Tab vom Studio geoeffnet, raeumt er sich am Ende selbst weg. */
  const AUTO='studioZahlenAuto';
  const istAuto=()=>{ try{ return sessionStorage.getItem(AUTO)==='1' }catch(_){ return false } };
  const setzeAuto=()=>{ try{ sessionStorage.setItem(AUTO,'1') }catch(_){} };
  const lade=()=>{ try{ return JSON.parse(sessionStorage.getItem(SK)||'null') }catch(_){ return null } };
  const speichere=z=>sessionStorage.setItem(SK, JSON.stringify(z));
  const weg=()=>sessionStorage.removeItem(SK);

  /* ---------- Anzeige ---------- */
  let box=null;
  function zeige(text, fertig){
    if(!box){ box=document.createElement('div');
      box.style.cssText='position:fixed;right:18px;bottom:18px;z-index:99999;background:#111;color:#fff;padding:12px 16px;border-radius:10px;font:13px/1.45 system-ui,sans-serif;max-width:360px;box-shadow:0 8px 24px rgba(0,0,0,.3)';
      document.body.appendChild(box); }
    box.innerHTML='<b>Post-Studio · Zahlen</b><br>'+text+(fertig?'<br><a href="https://phoeser.github.io/linkedin-post-studio/" style="color:#9cf">Zum Studio →</a> · <a href="#" id="stzu" style="color:#9cf">schließen</a>':'');
    const zu=document.getElementById('stzu'); if(zu) zu.onclick=e=>{ e.preventDefault(); box.remove(); box=null };
  }
  function warte(pruef, ms){ return new Promise(res=>{ const t0=Date.now(); (function tick(){ const v=pruef(); if(v||Date.now()-t0>ms) return res(v||null); setTimeout(tick,400) })() }) }
  function ruf(nutzlast){
    return new Promise((res,rej)=>GM_xmlhttpRequest({method:'POST', url:HOOK, headers:{'Content-Type':'application/json'},
      data:JSON.stringify(Object.assign({key:holeKey(), tab:holeTab()}, nutzlast)),
      onload:r=>res(r.responseText), onerror:()=>rej(new Error('Make nicht erreichbar'))}));
  }

  /* ---------- Schritt A: die Beitragsliste ---------- */
  function liste(){
    return [...document.querySelectorAll('li')].filter(e=>/hat dies gepostet|posted this/.test(e.innerText||'')).map(li=>{
      const a=[...li.querySelectorAll('a')].map(x=>((x.getAttribute('href')||'').match(/urn:li:activity:\d+/)||[])[0]).filter(Boolean)[0];
      const z=li.innerText.split('\n').map(s=>s.trim()).filter(Boolean);
      return {urn:a||null, alter:(z[0].split('•')[1]||'').trim(), anfang:(z[1]||'').slice(0,60)};
    }).filter(x=>x.urn && !/Monat|Jahr|month|year/i.test(x.alter));
  }
  async function starte(){
    zeige('Lese die Beitragsliste…');
    const l=await warte(()=>{ const x=liste(); return x.length?x:null }, 20000);
    if(!l){ zeige('Keine Beiträge gefunden — Seite neu laden und noch einmal.', true); return }
    speichere({queue:l, results:[], start:Date.now()});
    zeige(l.length+' Beiträge — gehe sie jetzt durch…');
    location.href='https://www.linkedin.com/analytics/post-summary/'+l[0].urn+'/';
  }

  /* ---------- Schritt B: ein Beitrag ---------- */
  function werte(){
    const t=document.body.innerText.replace(/\s*\n\s*/g,'\n');
    const nach=l=>{ const m=t.match(new RegExp(l+'\\n([\\d.,]+)')); return m?m[1]:null };
    const vor=l=>{ const m=t.match(new RegExp('([\\d.,]+)\\n'+l)); return m?m[1]:null };
    const imp=vor('Impressions'); if(imp===null) return null;
    const z=v=>parseInt(String(v||'0').replace(/[.,]/g,''),10)||0;
    return {imp:z(imp), int:z(vor('Soziale Interaktionen')), prof:z(vor('Mit diesem Beitrag generierte Profilansichten')),
            fol:z(vor('Mit diesem Beitrag gewonnene Follower')), rea:z(nach('Reaktionen')), kom:z(nach('Kommentare')), rep:z(nach('Reposts'))};
  }
  async function beitrag(z){
    const urn=(location.pathname.match(/urn:li:activity:\d+/)||[])[0];
    const kopf=z.queue[0];
    if(!urn || urn!==kopf.urn){ location.href='https://www.linkedin.com/analytics/post-summary/'+kopf.urn+'/'; return }
    zeige('Beitrag '+(z.results.length+1)+' von '+(z.results.length+z.queue.length)+'…');
    const w=await warte(werte, 20000);
    z.queue.shift();
    if(w) z.results.push(Object.assign({urn:urn, anfang:kopf.anfang}, w));
    speichere(z);
    if(z.queue.length) location.href='https://www.linkedin.com/analytics/post-summary/'+z.queue[0].urn+'/';
    else await schreibe(z);
  }

  /* ---------- Schritt C: ins Sheet ---------- */
  const norm=s=>String(s||'').toLowerCase().replace(/\s+/g,'').slice(0,28);
  async function schreibe(z){
    zeige('Schreibe ins Sheet…');
    try{
      const antwort=await ruf({action:'list'});
      let v; try{ v=JSON.parse(antwort).values }catch(_){ throw new Error('Sheet nicht lesbar: '+antwort.slice(0,60)) }
      const heute=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
      const rows=v.slice(1).map((r,i)=>({n:i+2, z:r.concat(Array(11).fill('')).slice(0,11)}));
      const alt={}; rows.forEach(({n,z})=>{ if(z[7]==='Zahlen'){ const m=/zeile=(\d+)\s+(urn:li:activity:\d+)/.exec(z[10]); if(m) alt[m[2]]={zeile:+m[1], titel:z[4]} } });
      const heuteDa=new Set(rows.filter(({z})=>z[7]==='Zahlen' && z[1]===heute).map(({z})=>z[4]));
      let nid=Math.max(0,...rows.map(({z})=>parseInt(z[0],10)||0))+1;
      let neu=0, uebersprungen=0;
      for(const r of z.results){
        let zeile=0, titel='';
        if(alt[r.urn]){ zeile=alt[r.urn].zeile; titel=alt[r.urn].titel }
        else{ const a=norm(r.anfang); const t=rows.find(({z})=>/Ver[öo]ffentlicht|Entwurf|Freigegeben/.test(z[7]) && norm(z[5])===a); if(t){ zeile=t.n; titel=t.z[4] } }
        if(!titel) titel=r.anfang.slice(0,40);
        if(heuteDa.has(titel)){ uebersprungen++; continue }
        /* Der Veroeffentlichungszeitpunkt steckt in den oberen Bits der Activity-Nummer. */
        let pub=''; try{ pub=new Date(Number(BigInt(r.urn.split(':').pop())>>22n)).toISOString().slice(0,16)+'Z' }catch(_){}
        const text=JSON.stringify({imp:r.imp,rea:r.rea,kom:r.kom,rep:r.rep,prof:r.prof,fol:r.fol,int:r.int,pub:pub});
        await ruf({action:'create', id:String(nid++), datum:heute, slot:'', saeule:'', titel:titel, text:text, bildurl:'', status:'Zahlen', notiz:'zeile='+zeile+' '+r.urn});
        neu++;
      }
      weg(); merkeLauf();
      zeige('Fertig: '+neu+' Messung'+(neu===1?'':'en')+' ins Sheet geschrieben'+(uebersprungen?', '+uebersprungen+' heute schon gemessen':'')+'. Im Studio „Neu laden“.', true);
      /* Vom Studio geoeffnet: nach kurzem Blick wieder zumachen. */
      if(istAuto()) setTimeout(()=>{ try{ window.close() }catch(_){} }, 4000);
    }catch(e){ weg(); zeige('Nicht geklappt: '+(e.message||e), true) }
  }

  /* ---------- Einstieg: das Studio ---------- */
  if(location.hostname==='phoeser.github.io'){
    /* Sofort melden, dass es mich gibt: das Studio zeigt sonst den Installationsknopf
       und oeffnet beim Messen gar keinen LinkedIn-Tab (patch66). */
    try{ (typeof unsafeWindow!=='undefined'?unsafeWindow:window).__ZAHLEN_SKRIPT='3.1' }catch(_){}
    /* Nach dem Anmelden steht der Schluessel bereit — einmal abholen, dann nie wieder. */
    let n=0; const tick=setInterval(()=>{
      let k=null, t=null;
      try{ k=(typeof unsafeWindow!=='undefined'?unsafeWindow:window).__STUDIO_KEY;
           t=(typeof unsafeWindow!=='undefined'?unsafeWindow:window).__STUDIO_TAB }catch(_){}
      if(k){ clearInterval(tick);
        try{ if(GM_getValue('key','')!==k){ GM_setValue('key',k); GM_setValue('tab',t||'Untitled');
          zeige('Verbunden. Die Zahlen werden ab jetzt beim Öffnen der Analytik geholt.', true) } }catch(_){}
      }
      if(++n>120) clearInterval(tick);
    }, 1000);
    return;
  }

  /* ---------- Einstieg: LinkedIn ---------- */
  if(!holeKey()){
    /* Ohne Schluessel geht nichts — aber nur dort sagen, wo es hingehoert. */
    if(location.pathname.startsWith('/analytics/creator/top-posts'))
      zeige('Noch nicht verbunden: einmal das <a href="https://phoeser.github.io/linkedin-post-studio/" style="color:#9cf">Post-Studio</a> öffnen und anmelden, danach läuft es von allein.', true);
    return;
  }
  const z=lade();
  if(z && z.queue && (Date.now()-z.start) < 15*60000){
    if(location.pathname.startsWith('/analytics/post-summary/')) beitrag(z);
    else if(z.queue.length) location.href='https://www.linkedin.com/analytics/post-summary/'+z.queue[0].urn+'/';
    return;
  }
  if(location.pathname.startsWith('/analytics/creator/top-posts')){
    /* Vom Studio geoeffnet — ohne Zutun loslaufen und den Tab hinterher schliessen. */
    if(location.hash==='#studio-zahlen-auto'){
      history.replaceState(null,'',location.pathname+location.search); setzeAuto(); starte(); return }
    if(location.hash==='#studio-zahlen'){ history.replaceState(null,'',location.pathname+location.search); starte(); return }
    /* Von Hand hier gelandet und heute noch nicht gemessen: auch dann von allein. */
    if(!gelaufenHeute()){ starte(); return }
    const b=document.createElement('button');
    b.textContent='Zahlen ins Post-Studio';
    b.style.cssText='position:fixed;right:18px;bottom:18px;z-index:99999;background:#0a66c2;color:#fff;border:0;border-radius:999px;padding:10px 16px;font:600 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.25)';
    b.onclick=()=>{ b.remove(); starte() };
    document.body.appendChild(b);
  }
})();
