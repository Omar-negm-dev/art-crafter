/* Art Crafter: dependency-free, testable document helpers. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ArtCrafterCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(Number(n)) ? Number(n) : lo));
  const integer = (n, lo, hi) => Math.round(clamp(n, lo, hi));
  const validDimensions = (w, h) => Number.isInteger(Number(w)) && Number.isInteger(Number(h)) && Number(w) >= 64 && Number(h) >= 64 && Number(w) <= 4096 && Number(h) <= 4096;
  const safeName = value => String(value || 'Untitled').replace(/[\\/:*?"<>|\x00-\x1f]/g, '').trim().slice(0, 90) || 'Untitled';
  const filterCss = props => `brightness(${100 + integer(props.brightness ?? 0, -90, 100)}%) contrast(${100 + integer(props.contrast ?? 0, -90, 100)}%) saturate(${integer(props.saturation ?? 100, 0, 300)}%) blur(${integer(props.blur ?? 0, 0, 20)}px)`;
  const rectFromPoints = (a,b) => ({x:Math.round(Math.min(a.x,b.x)),y:Math.round(Math.min(a.y,b.y)),w:Math.round(Math.abs(a.x-b.x)),h:Math.round(Math.abs(a.y-b.y))});
  const inCanvas = (p,w,h) => p.x>=0 && p.y>=0 && p.x<=w && p.y<=h;
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const validColor = v => HEX.test(String(v));
  const defaultFilters = () => ({brightness:0,contrast:0,saturation:100,blur:0});
  const sanitizeLayerInfo = x => ({ id:String(x.id||'').slice(0,120),name:safeName(x.name||'Layer'),x:integer(x.x??0,-8192,8192),y:integer(x.y??0,-8192,8192),opacity:clamp(x.opacity??100,0,100),visible:x.visible!==false,locked:x.locked===true,filters:{brightness:integer(x.filters?.brightness??0,-90,100),contrast:integer(x.filters?.contrast??0,-90,100),saturation:integer(x.filters?.saturation??100,0,300),blur:integer(x.filters?.blur??0,0,20)}});
  const supportedImage = t => ['image/png','image/jpeg','image/webp','image/gif'].includes(t);
  return {clamp, integer, validDimensions, safeName, filterCss, rectFromPoints, inCanvas, validColor, defaultFilters, sanitizeLayerInfo, supportedImage};
});
