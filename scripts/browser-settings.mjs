// Linux Firefox needs an X11 display to initialize software WebGL reliably.
// This is confined to the disposable CI browser; user browser settings are not changed.
export const firefoxLaunch={
  headless:!(process.env.CI&&process.platform==='linux'),args:[],
  firefoxUserPrefs:{'webgl.force-enabled':true,'webgl.disabled':false,'gfx.webrender.software':true}
};
