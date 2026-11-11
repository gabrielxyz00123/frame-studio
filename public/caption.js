/* Opção "Cobrir a legenda do vídeo de origem" (usa o corte do trim.js) */
(function () {
  'use strict';
  function $(s) { return document.querySelector(s); }
  var st = document.createElement('style');
  st.textContent = '.caption-box{margin-top:16px;padding-top:14px;border-top:1px solid var(--line)}';
  document.head.append(st);
  function init() {
    var panel = $('.trim-panel');
    if (!panel || $('#blur-on')) return;
    var box = document.createElement('div');
    box.className = 'caption-box';
    box.innerHTML =
      '<label class="check-label"><input type="checkbox" id="blur-on"> <b>Cobrir a legenda do vídeo de origem</b></label>' +
      '<p class="muted">Borra a faixa onde a legenda aparece, antes do envio, para o Wan não copiar o texto. Usa o corte (liga sozinho). Mantenha a aba visível durante o corte.</p>' +
      '<div class="trim-fields"><div><label for="blur-top">Faixa começa em (% da altura)</label><input id="blur-top" type="number" min="0" max="99" step="1" value="72" disabled></div>' +
      '<div><label for="blur-bottom">Faixa termina em (% da altura)</label><input id="blur-bottom" type="number" min="1" max="100" step="1" value="93" disabled></div></div>' +
      '<button type="button" class="secondary" id="blur-preview" disabled>Ver prévia da faixa</button><canvas id="blur-canvas" hidden></canvas>';
    panel.append(box);
    var on = $('#blur-on'), trimOn = $('#trim-on');
    function sync() {
      $('#blur-top').disabled = $('#blur-bottom').disabled = $('#blur-preview').disabled = !on.checked;
      if (!on.checked) $('#blur-canvas').hidden = true;
    }
    on.addEventListener('change', function () {
      if (on.checked && trimOn && !trimOn.checked) { trimOn.checked = true; trimOn.dispatchEvent(new Event('change', { bubbles: true })); }
      sync();
    });
    if (trimOn) trimOn.addEventListener('change', function () { if (!trimOn.checked && on.checked) { on.checked = false; sync(); } });
    $('#blur-preview').onclick = function () {
      var f = (typeof files !== 'undefined' && files[0]) || null;
      var file = f && (f.file || f);
      if (!file) { try { toast('Adicione um vídeo primeiro.'); } catch (e) {} return; }
      var url = URL.createObjectURL(file), v = document.createElement('video');
      v.muted = true; v.preload = 'auto'; v.src = url;
      v.onloadedmetadata = function () { v.currentTime = Math.min(Math.max(0, Number($('#trim-start').value) || 0) + 0.5, Math.max(0, v.duration - 0.1)); };
      v.onseeked = function () {
        var cv = $('#blur-canvas'), s = window.captionBandSettings();
        var cw = v.videoWidth, ch = v.videoHeight;
        cv.width = cw; cv.height = ch;
        cv.style.cssText = 'display:block;max-width:100%;max-height:420px;margin-top:12px;border-radius:8px';
        window.drawCaptionBand(cv.getContext('2d'), v, cw, ch, s.top, s.bottom);
        cv.hidden = false;
        URL.revokeObjectURL(url);
      };
      v.onerror = function () { URL.revokeObjectURL(url); try { toast('Não foi possível abrir o vídeo.'); } catch (e) {} };
    };
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
