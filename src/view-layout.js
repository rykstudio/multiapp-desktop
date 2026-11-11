'use strict';
const HEADER_HEIGHT=71;
function calculateBounds(width,height,mode='desktop'){
  const w=Math.max(1,Math.floor(width)),h=Math.max(1,Math.floor(height));
  if(mode!=='mobile')return {x:0,y:HEADER_HEIGHT,width:w,height:Math.max(1,h-HEADER_HEIGHT)};
  const available=Math.max(1,h-HEADER_HEIGHT);
  const frameWidth=Math.min(440,Math.max(1,w-48));
  const frameHeight=Math.min(890,Math.max(1,available-36));
  const frameX=Math.floor((w-frameWidth)/2);
  const frameY=HEADER_HEIGHT+Math.floor((available-frameHeight)/2);
  return {
    x:frameX+12,
    y:frameY+54,
    width:Math.max(1,frameWidth-24),
    height:Math.max(1,frameHeight-74)
  };
}
module.exports={HEADER_HEIGHT,calculateBounds};
