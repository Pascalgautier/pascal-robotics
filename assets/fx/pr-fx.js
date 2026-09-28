/* ===== Pascal Robotics — shared page effects (pr-fx) =====
   Include once per page, after pr-fx.css:
     <script src="assets/fx/pr-fx.js" defer data-fx-theme="green|blue"
             data-fx-titles="CSS selector of titles" data-fx-blocks="CSS selector of blocks"></script>

   1) Title fill — same logic / visual language as the accueil #why fill, but NOT pinned:
      - each title is split into word spans (nowrap, so words never break) then letter spans,
        all aria-hidden, with a visually-hidden copy of the text for screen readers;
        inner elements (.soft, .accent, <br>…) are kept, each letter fills to its own final colour;
      - progress follows the title's position: 0 when its top is at 92% of the viewport height,
        1 when it reaches 45% (or its lowest reachable position near the end of the page);
      - per-letter timeline: pale accent -> accent edge -> final colour (stagger per letter),
        smoothed like the #why fill (exponential, tau 0.25s); reverses when scrolling up;
      - one shared rAF-throttled passive scroll handler; IntersectionObserver limits work to
        visible titles (titles inside password-gated content start when the content is shown);
      - no layout shift: letter spans lose a little kerning, so the original line breaks are
        measured before splitting and pinned (one nowrap .fx-line per original line); titles
        hidden behind a password gate are finished by a ResizeObserver when shown (before paint);
        a viewport width change re-splits (once per frame);
      - re-splits when the i18n code rewrites a title (MutationObserver);
      - prefers-reduced-motion: reduce -> no split, final colours.
   2) Block hover border — adds .fx-hb to the configured blocks (styles in pr-fx.css) and appends
      border-color / box-shadow to each block's existing transitions (existing ones are kept). */
(function(){
  'use strict';
  var script = document.currentScript;
  if (!script || !window.requestAnimationFrame || !document.querySelectorAll) return;
  var THEME = script.getAttribute('data-fx-theme') === 'blue' ? 'blue' : 'green';
  var TITLE_SEL = script.getAttribute('data-fx-titles') || '';
  var BLOCK_SEL = script.getAttribute('data-fx-blocks') || '';
  document.documentElement.setAttribute('data-fx-theme', THEME);

  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced(){ return !!(mq && mq.matches); }

  /* ---------- 2) blocks ---------- */
  function listCount(v){ return v.replace(/\([^)]*\)/g, '').split(',').length; }
  function initBlocks(){
    if (!BLOCK_SEL) return;
    var list;
    try { list = document.querySelectorAll(BLOCK_SEL); } catch (e) { return; }
    var noMotion = reduced();
    Array.prototype.forEach.call(list, function(el){
      if (el.closest('nav, .nav, button, .btn')) return;
      el.classList.add('fx-hb');
      if (noMotion) return;
      var cs = getComputedStyle(el);
      var p = cs.transitionProperty, d = cs.transitionDuration, f = cs.transitionTimingFunction, dl = cs.transitionDelay;
      var n = listCount(p);
      if (listCount(d) !== n || listCount(f) !== n || listCount(dl) !== n) return;
      el.style.transitionProperty = p + ', border-color, box-shadow';
      el.style.transitionDuration = d + ', .25s, .25s';
      el.style.transitionTimingFunction = f + ', ease, ease';
      el.style.transitionDelay = dl + ', 0s, 0s';
    });
  }

  /* ---------- 1) titles ---------- */
  var STAGGER = 0.08, A_START = 0.15, A_DUR = 0.35, B_DELAY = 0.3, B_DUR = 0.6, TAU = 0.25;
  var START = 0.92, END = 0.45;           /* title top, as a fraction of the viewport height */
  var UNREAD_LIGHT = 0.3, UNREAD_A = 0.3; /* pale accent: accent lightened 30% toward white, 30% opacity */
  var titles = [], rafId = 0, lastT = 0, mo = null, io = null, ro = null, ACC = null, DIM = null;

  function clamp01(v){ return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(t){ return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2; }
  function vh(){ return window.innerHeight || document.documentElement.clientHeight; }
  function parseColor(s){
    var m = (s || '').match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    return [+m[0], +m[1], +m[2], m.length > 3 ? +m[3] : 1];
  }
  function colours(){
    var probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;color:var(--fx-accent)';
    document.body.appendChild(probe);
    ACC = parseColor(getComputedStyle(probe).color) || (THEME === 'blue' ? [61,139,255,1] : [156,229,26,1]);
    document.body.removeChild(probe);
    DIM = [ACC[0] + (255-ACC[0])*UNREAD_LIGHT, ACC[1] + (255-ACC[1])*UNREAD_LIGHT, ACC[2] + (255-ACC[2])*UNREAD_LIGHT, UNREAD_A];
  }

  function isBlock(el){ return /^(block|flex|grid|list-item|table)/.test(getComputedStyle(el).display); }
  function readText(node){
    var out = '';
    Array.prototype.forEach.call(node.childNodes, function(k){
      if (k.nodeType === 3) out += k.nodeValue;
      else if (k.nodeType === 1){
        if (k.tagName === 'BR') out += ' ';
        else if (!k.classList.contains('fx-sr')){
          var b = isBlock(k);
          out += (b ? ' ' : '') + readText(k) + (b ? ' ' : '');
        }
      }
    });
    return out;
  }

  /* ---- split ----
     Letter spans change glyph advances a little (kerning lost across spans), which could move a
     line break. So the split pins the ORIGINAL line breaks: every run of words that sat on the
     same line is wrapped in a nowrap .fx-line (its inner spaces cannot wrap), and a word is only
     cut after a dash where the original line actually broke. Same lines -> same height.
     Titles without a box yet (password gates) are split plainly, then redone by the
     ResizeObserver as soon as they get one (after layout, before paint); a width change
     re-splits them. t.comp = split was measured (line breaks pinned). */
  var DASH_RE = /[-\u2010\u2013\u2014]/;
  function tokens(t){
    var list = [];
    (function walk(node){
      Array.prototype.forEach.call(node.childNodes, function(k){
        if (k.nodeType === 1){
          if (k.tagName === 'BR') list.push({ br: true });
          else walk(k);
          return;
        }
        if (k.nodeType !== 3 || !k.nodeValue) return;
        var re = /[ \t\n\r\f]+|[^ \t\n\r\f]+/g, m;
        while ((m = re.exec(k.nodeValue))){
          list.push(/^[ \t\n\r\f]/.test(m[0]) ? { ws: m[0], node: k } : { u: m[0], node: k, s: m.index, e: m.index + m[0].length });
        }
      });
    })(t.el);
    return list;
  }
  function charRect(node, i){
    var r = document.createRange();
    r.setStart(node, i); r.setEnd(node, i + 1);
    return r.getClientRects()[0] || null;
  }
  function newLine(a, b){ return !a || !b || Math.abs(b.top - a.top) > 2; }

  function plan(t, boxed){
    var list = tokens(t);
    list.forEach(function(tk){
      if (tk.u == null || !boxed) return;
      tk.cuts = [];
      for (var j = tk.s; j < tk.e - 1; j++){
        var c = tk.node.nodeValue.charAt(j), nx = tk.node.nodeValue.charAt(j + 1);
        if (DASH_RE.test(c) && !DASH_RE.test(nx) && newLine(charRect(tk.node, j), charRect(tk.node, j + 1))) tk.cuts.push(j + 1);
      }
    });
    /* group into original lines (a soft wrap, a <br>, or a parent-element edge starts a new line) */
    var lines = [], cur = [];
    function flush(){ if (cur.length){ lines.push(cur); cur = []; } }
    list.forEach(function(tk, i){
      if (tk.br){ flush(); return; }
      if (tk.ws != null){
        var p = list[i - 1], n = list[i + 1];
        if (boxed && p && n && p.u != null && n.u != null && newLine(charRect(p.node, p.e - 1), charRect(n.node, n.s))){
          cur.after = tk; flush(); return;         /* keep the breaking space between the two lines */
        }
        cur.push(tk); return;
      }
      if (cur.length){
        var last = null;
        for (var k = cur.length - 1; k >= 0; k--) if (cur[k].u != null){ last = cur[k]; break; }
        /* never merge across text nodes (an inline element such as .soft / .accent sits between):
           each keeps its own place and colour */
        if (last && last.node !== tk.node) flush();
        else if (boxed && last && newLine(charRect(last.node, last.e - 1), charRect(tk.node, tk.s))) flush();
      }
      if (tk.cuts && tk.cuts.length){             /* the original line broke after a dash inside this word */
        var from = tk.s;
        tk.cuts.concat([tk.e]).forEach(function(to, ci){
          if (ci) flush();
          cur.push({ u: tk.node.nodeValue.slice(from, to), node: tk.node, s: from, e: to });
          from = to;
        });
        return;
      }
      cur.push(tk);
    });
    flush();
    return lines;
  }

  function build(t, lines, srText){
    var el = t.el, chars = [], words = [], fin = [], cache = [];
    var byNode = [], frags = [];
    function fragOf(node){
      var i = byNode.indexOf(node);
      if (i < 0){ byNode.push(node); i = frags.push(document.createDocumentFragment()) - 1; }
      return frags[i];
    }
    function word(parent, text){
      var w = document.createElement('span');
      w.className = 'fx-w';
      w.setAttribute('aria-hidden', 'true');
      Array.from(text).forEach(function(c){
        var s = document.createElement('span');
        s.className = 'fx-c'; s.textContent = c;
        w.appendChild(s); chars.push(s);
      });
      parent.appendChild(w); words.push(w);
    }
    /* every token goes back into its own text node's place; the words of one original line (all
       from one text node) share a nowrap shell */
    lines.forEach(function(line){
      var shell = null;
      line.forEach(function(tk){
        var frag = fragOf(tk.node);
        if (tk.ws != null){
          (shell && shell._node === tk.node ? shell : frag).appendChild(document.createTextNode(tk.ws));
          return;
        }
        if (!shell){
          shell = document.createElement('span');
          shell.className = 'fx-line';
          shell.setAttribute('aria-hidden', 'true');
          shell._node = tk.node;
          frag.appendChild(shell);
        }
        word(shell, tk.node.nodeValue.slice(tk.s, tk.e));
      });
      if (line.after) fragOf(line.after.node).appendChild(document.createTextNode(line.after.ws));
    });
    byNode.forEach(function(node, i){ node.parentNode.replaceChild(frags[i], node); });
    var sr = document.createElement('span');
    sr.className = 'fx-sr';
    sr.textContent = srText;
    el.insertBefore(sr, el.firstChild);
    el.classList.add('fx-title');
    var parents = [], pcols = [];
    chars.forEach(function(c){
      var par = c.parentNode.parentNode.parentNode, i = parents.indexOf(par);
      if (i < 0){ parents.push(par); i = pcols.push(parseColor(getComputedStyle(par).color)) - 1; }
      var col = pcols[i];
      fin.push(col && col[3] > 0 ? col : null);
      cache.push(-1);
    });
    t.chars = chars; t.fin = fin; t.cache = cache; t.words = words;
    t.total = A_START + B_DELAY + B_DUR + Math.max(chars.length - 1, 0) * STAGGER;
    t.on = true;
  }

  function unsplit(t){
    var el = t.el;
    Array.prototype.forEach.call(el.querySelectorAll('.fx-sr'), function(s){ s.parentNode.removeChild(s); });
    Array.prototype.forEach.call(el.querySelectorAll('.fx-line'), function(line){
      var text = line.textContent;
      line.parentNode.replaceChild(document.createTextNode(text), line);
    });
    el.normalize();
    el.classList.remove('fx-title');
    t.chars = []; t.fin = []; t.cache = []; t.words = []; t.on = false; t.comp = false;
  }

  function hasBox(el){ var r = el.getBoundingClientRect(); return !!(r.width || r.height); }

  function splitAll(list){
    flushMO();
    list.forEach(function(t){ if (t.on) unsplit(t); });
    var boxed = list.map(function(t){ return hasBox(t.el); });
    var srs = list.map(function(t){ return readText(t.el).replace(/\s+/g, ' ').trim(); });
    var plans = list.map(function(t, i){ return plan(t, boxed[i]); });
    list.forEach(function(t, i){
      build(t, plans[i], srs[i]);
      t.comp = boxed[i];
      if (!boxed[i] && ro) ro.observe(t.el);
    });
    if (mo) mo.takeRecords();
  }

  function progress(t){
    var r = t.el.getBoundingClientRect();
    if (!r.height && !r.width) return null; /* hidden (e.g. behind a password gate) */
    var h = vh(), doc = document.documentElement;
    var maxScroll = Math.max((doc.scrollHeight || 0) - h, 0);
    var sy = window.pageYOffset || doc.scrollTop || 0;
    var start = START * h, end = END * h;
    var topAtMax = r.top - (maxScroll - sy);   /* lowest reachable top: end of the page */
    if (topAtMax > end){ end = topAtMax; start = Math.max(start, end + 0.3 * h); }
    return clamp01((start - r.top) / (start - end));
  }

  function render(t){
    var T = t.cur * t.total, chars = t.chars, fin = t.fin, cache = t.cache;
    for (var i = 0; i < chars.length; i++){
      var F = fin[i];
      if (!F) continue;
      var x = T - A_START - i * STAGGER;
      var a = ease(clamp01(x / A_DUR));
      var b = ease(clamp01((x - B_DELAY) / B_DUR));
      var key = Math.round(a * 100) * 101 + Math.round(b * 100);
      if (key === cache[i]) continue;
      cache[i] = key;
      var rr = DIM[0] + (ACC[0]-DIM[0])*a, gg = DIM[1] + (ACC[1]-DIM[1])*a,
          bb = DIM[2] + (ACC[2]-DIM[2])*a, al = DIM[3] + (ACC[3]-DIM[3])*a;
      rr += (F[0]-rr)*b; gg += (F[1]-gg)*b; bb += (F[2]-bb)*b; al += (F[3]-al)*b;
      chars[i].style.color = 'rgba(' + Math.round(rr) + ',' + Math.round(gg) + ',' + Math.round(bb) + ',' + al.toFixed(3) + ')';
    }
  }

  function settle(t){
    var p = progress(t);
    if (p === null) return;
    t.cur = p; t.fresh = false; render(t);
  }

  function tick(now){
    rafId = 0;
    var dt = lastT ? Math.min((now - lastT) / 1000, 0.1) : 0.016;
    lastT = now;
    var k = 1 - Math.exp(-dt / TAU), again = false;
    for (var i = 0; i < titles.length; i++){
      var t = titles[i];
      if (!t.on || !t.visible) continue;
      var p = progress(t);
      if (p === null) continue;
      if (t.fresh){ t.cur = p; t.fresh = false; render(t); continue; }
      var next = t.cur + (p - t.cur) * k;
      if (Math.abs(p - next) < 0.001) next = p;
      if (next !== t.cur){ t.cur = next; render(t); }
      if (next !== p) again = true;
    }
    if (again) rafId = requestAnimationFrame(tick);
    else lastT = 0;
  }
  function kick(){ if (!rafId){ lastT = 0; rafId = requestAnimationFrame(tick); } }

  function titleOf(node){
    for (var n = node; n && n !== document; n = n.parentNode){
      for (var i = 0; i < titles.length; i++) if (titles[i].el === n) return titles[i];
    }
    return null;
  }
  function resplit(list){
    splitAll(list);
    list.forEach(function(t){
      var p = progress(t);
      if (p === null){ t.cur = 0; t.fresh = true; } else { t.cur = p; t.fresh = false; }
      render(t);
    });
  }

  /* i18n rewrote a title (textContent / innerHTML) -> rebuild it from its new content */
  var inMO = false;
  function onMutations(records){
    var todo = [];
    records.forEach(function(r){
      var t = titleOf(r.target);
      if (t && t.on && todo.indexOf(t) < 0) todo.push(t);
    });
    if (!todo.length) return;
    inMO = true;
    mo.disconnect();
    resplit(todo);
    titles.forEach(function(t){ mo.observe(t.el, { childList: true, characterData: true, subtree: true }); });
    inMO = false;
  }
  function flushMO(){ if (mo && !inMO){ var rec = mo.takeRecords(); if (rec.length) onMutations(rec); } }

  function enableTitles(){
    resplit(titles.filter(function(t){ return !t.on; }));
    if (mo){
      mo.takeRecords();
      titles.forEach(function(t){ mo.observe(t.el, { childList: true, characterData: true, subtree: true }); });
    }
    kick();
  }
  function disableTitles(){
    if (mo) mo.disconnect();
    titles.forEach(function(t){ if (t.on) unsplit(t); });
  }

  function initTitles(){
    if (!TITLE_SEL) return;
    var list;
    try { list = document.querySelectorAll(TITLE_SEL); } catch (e) { return; }
    Array.prototype.forEach.call(list, function(el){
      titles.push({ el: el, chars: [], fin: [], cache: [], cur: 0, total: 1, on: false, fresh: true, visible: true });
    });
    if (!titles.length) return;
    colours();

    if ('MutationObserver' in window){
      mo = new MutationObserver(onMutations);
    }
    /* Titles inside hidden content (password gates): ResizeObserver fires once they get a box,
       after layout and before paint -> measured re-split + colour them for the exact scroll position
       without a flash, then stop observing them. */
    if ('ResizeObserver' in window){
      ro = new ResizeObserver(function(entries){
        var list = [];
        entries.forEach(function(e){
          var t = titleOf(e.target);
          if (t && t.on && !t.comp && hasBox(t.el) && list.indexOf(t) < 0) list.push(t); /* still 0x0: keep waiting */
        });
        if (!list.length) return;
        list.forEach(function(t){ ro.unobserve(t.el); });
        resplit(list);                          /* measured split + exact colours, before paint */
      });
    }
    if ('IntersectionObserver' in window){
      titles.forEach(function(t){ t.visible = false; });
      io = new IntersectionObserver(function(entries){
        entries.forEach(function(e){
          var t = titleOf(e.target);
          if (!t) return;
          t.visible = e.isIntersecting;
          if (t.on) settle(t); /* entering (15% margin, still off-screen) or leaving: jump to the exact state */
        });
        kick();
      }, { rootMargin: '15% 0px 15% 0px' });
      titles.forEach(function(t){ io.observe(t.el); });
    }

    if (!reduced()) enableTitles();
    if (mq){
      var onChange = function(){ if (reduced()) disableTitles(); else enableTitles(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
    window.addEventListener('scroll', kick, { passive: true });
    /* width change -> line breaks change -> re-split (pinned breaks are width-specific); once per frame */
    var lastW = window.innerWidth, rzRaf = 0;
    window.addEventListener('resize', function(){
      kick();
      if (window.innerWidth === lastW || rzRaf) return;   /* mobile toolbar height changes: nothing to do */
      rzRaf = requestAnimationFrame(function(){
        rzRaf = 0;
        lastW = window.innerWidth;
        var on = titles.filter(function(t){ return t.on; });
        if (on.length) resplit(on);
        kick();
      });
    }, { passive: true });
    window.addEventListener('load', kick);
    document.addEventListener('transitionend', kick, { passive: true }); /* reveal animations move titles without scrolling */
  }

  function init(){ initBlocks(); initTitles(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
