import {expect,it} from "vitest";
import {compositeCursorPixel} from "./cursor.js";
const base={width:4,height:1,pitch:1,hotspotX:0,hotspotY:0};
it("keeps transparent pixels, black/white pixels and monochrome background inversion distinct",()=>{
 const shape={...base,kind:1 as const},data=new Uint8Array([0x30,0x50]);
 const expected=[[0,0,0,255],[255,255,255,255],[10,20,30,255],[245,235,225,255]];
 for(let x=0;x<4;x++){const target=new Uint8ClampedArray([10,20,30,255]);compositeCursorPixel(shape,data,x,0,target,0);expect(Array.from(target)).toEqual(expected[x]);}
});
it("uses exact colored XOR and alpha blending, including premultiplied alpha and alpha-zero garbage",()=>{
 const shape={...base,width:1,pitch:4,kind:4 as const},target=new Uint8ClampedArray([10,20,30,255]);
 compositeCursorPixel(shape,new Uint8Array([1,2,3,255]),0,0,target,0);expect(Array.from(target)).toEqual([9,22,31,255]);
 for(const premultiplied of [false,true]){const alpha={...shape,kind:2 as const,premultiplied},bg=new Uint8ClampedArray([100,100,100,255]);compositeCursorPixel(alpha,new Uint8Array([0,0,premultiplied?64:128,128]),0,0,bg,0);expect(Array.from(bg)).toEqual([114,50,50,255]);}
 const bg=new Uint8ClampedArray([10,20,30,255]);compositeCursorPixel({...shape,kind:2,premultiplied:true},new Uint8Array([255,255,255,0]),0,0,bg,0);expect(Array.from(bg)).toEqual([10,20,30,255]);
});
