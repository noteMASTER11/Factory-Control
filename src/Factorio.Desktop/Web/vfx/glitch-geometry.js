export function makeGlitchBlocks(random=Math.random){
 return Array.from({length:2+Math.floor(random()*3)},()=>{const width=.10+random()*.24,height=.035+random()*.11,x=.025+random()*(.95-width),y=.08+random()*(.84-height),skew=(random()-.5)*.03;
  return {points:[[x,y],[x+width,y+skew],[x+width+skew,y+height],[x-skew,y+height-skew]],shift:(random()<.5?-1:1)*(.55+random()*.45)};
 });
}
export function insideQuad(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
