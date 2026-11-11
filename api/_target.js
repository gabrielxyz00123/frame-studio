/* Marca feita por clique no primeiro quadro. O site grava a marca em portugues
   ("a pessoa que esta no centro do quadro, no meio (a cerca de 42% da largura e 45% da altura) [rosto 1 de 2]").
   Aqui ela vira uma descricao em ingles, sem ambiguidade: lado do quadro, ordem dos rostos e posicao em relacao as outras pessoas marcadas.
   "[rosto i de n]" existe quando o clique foi preso a um rosto encontrado pelo detector; ai o ponto e o centro do rosto. */
const MARK=/a pessoa que est[aá]\s+(?:no centro|[aà] esquerda|[aà] direita) do quadro, n[ao] (?:parte de cima|parte de baixo|meio) \(a cerca de (\d{1,3})% da largura e (\d{1,3})% da altura\)(?:\s*\[rosto (\d{1,2}) de (\d{1,2})\])?/i;
export function parseMark(text){
  const s=typeof text==='string'?text.normalize('NFC'):'';
  const m=MARK.exec(s);
  if(!m)return null;
  const x=Math.min(100,Number(m[1])),y=Math.min(100,Number(m[2]));
  const rest=(s.slice(0,m.index)+' '+s.slice(m.index+m[0].length)).replace(/\s+/g,' ').replace(/^[\s,;.:\-]+|[\s,;.:\-]+$/g,'');
  const n=Number(m[4])||0,i=Number(m[3])||0;
  return {x,y,rest,face:n>=1&&i>=1&&i<=n?{i,n}:null};
}
function side(x){return x<20?'at the far left of the frame':x<45?'on the left side of the frame':x<=55?'in the horizontal center of the frame':x<=80?'on the right side of the frame':'at the far right of the frame';}
function level(y){return y<30?', in the upper part':y>70?', in the lower part':'';}
function order(f){return f.n===1?'it is the only clearly visible face':f.i===1?'it is the leftmost face':f.i===f.n?'it is the rightmost face':'it is face number '+f.i+' counting from the left';}
export function englishTargets(list){
  const raws=(Array.isArray(list)?list:[]).map(v=>typeof v==='string'?v:String(v??''));
  const marks=raws.map(parseMark);
  return raws.map((raw,i)=>{
    const m=marks[i];
    if(!m)return raw.trim();
    const rel=[];
    marks.forEach((o,j)=>{
      if(j===i||!o)return;
      const dx=m.x-o.x,dy=m.y-o.y;
      if(Math.abs(dx)>=3)rel.push((dx<0?'to the left of':'to the right of')+' Person '+(j+1));
      else if(Math.abs(dy)>=3)rel.push((dy<0?'above':'below')+' Person '+(j+1));
    });
    const tail=(rel.length?'; '+rel.join(', '):'')+')'+(m.rest?'. Extra description: '+m.rest:'');
    if(m.face)return 'the person '+side(m.x)+level(m.y)+' whose FACE is centered at the point '+m.x+'% from the left edge and '+m.y+'% from the top edge at the start of the scene ('+order(m.face)+tail;
    return 'the person '+side(m.x)+level(m.y)+' (at the start of the scene their body is around the point '+m.x+'% from the left edge and '+m.y+'% from the top edge; it is the one person closest to that point'+tail;
  });
}
