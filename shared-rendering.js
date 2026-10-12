/** Render effects once into a texture, then compose each display in the same GL context. */
class SharedRenderer {
  static crop(sourceWidth, sourceHeight, width, height) {
    const ratio = (width / height) / (sourceWidth / sourceHeight);
    return ratio < 1 ? [ratio, 1] : [1, 1 / ratio];
  }

  constructor(app, stream) {
    this.app = app;
    const gl = this.gl = app.gl;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.framebuffer = gl.createFramebuffer();
    const vertex = app.createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragment = app.createShader(gl.FRAGMENT_SHADER, `precision highp float;
      varying vec2 v_uv;
      uniform sampler2D background;
      uniform sampler2D text;
      uniform vec2 crop;
      void main() {
        vec4 scene = texture2D(background, (v_uv - 0.5) * crop + 0.5);
        float mask = texture2D(text, v_uv).a;
        if (mask <= 0.005) mask = 0.0;
        vec3 ink = scene.a > 0.75 ? vec3(0.04) : vec3(0.98);
        gl_FragColor = vec4(mix(scene.rgb, ink, mask), 1.0);
      }`);
    if (!vertex || !fragment) throw new Error('共用畫面合成器初始化失敗');
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.bindAttribLocation(this.program, 0, 'a_position');
    gl.linkProgram(this.program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, 'background'), 0);
    gl.uniform1i(gl.getUniformLocation(this.program, 'text'), 1);
    this.cropUniform = gl.getUniformLocation(this.program, 'crop');
    gl.useProgram(app.program);
    this.stream = stream || app.canvas.captureStream(0);
    this.track = this.stream.getVideoTracks()[0];
    if (!this.track?.requestFrame) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = app.canvas.captureStream(60);
      this.track = this.stream.getVideoTracks()[0];
    }
    this.addDisplay(app);
  }

  get displays() { return [this.app, ...this.app.sharedDisplays]; }

  addDisplay(display) {
    if (display.sharedVideo?.srcObject === this.stream) return;
    const video = display.displayCanvas.ownerDocument.createElement('video');
    display.sharedVideo = video;
    display.displayCanvas.style.visibility = 'hidden';
    video.muted = true;
    video.autoplay = true;
    // Canvas playback must not keep an idle display awake.
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');
    video.style.cssText = 'position:fixed;max-width:none;pointer-events:none;z-index:0;';
    display.displayCanvas.after(video);
    video.srcObject = this.stream;
    video.addEventListener('loadeddata', () => display.notifyFirstFrame());
    video.play().catch(error => {
      console.error('Shared display playback failed', error);
      window.webkit?.messageHandlers?.macApp?.postMessage({ action: 'sharedRenderingError' });
    });
  }

  resize() {
    const displays = this.displays.filter(display => display.outputWidth && display.outputHeight);
    const gl = this.gl;
    const limit = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
    const totalHeight = displays.reduce((sum, display) => sum + display.outputHeight, 0);
    const horizontal = totalHeight > limit;
    let width = 0, height = 0;
    for (const display of displays) {
      display.sharedRect = { x: horizontal ? width : 0, y: horizontal ? 0 : height,
        width: display.outputWidth, height: display.outputHeight };
      width = horizontal ? width + display.outputWidth : Math.max(width, display.outputWidth);
      height = horizontal ? Math.max(height, display.outputHeight) : height + display.outputHeight;
    }
    if (width > limit || height > limit) throw new Error('螢幕總解析度超過共用畫面上限');
    if (this.app.canvas.width !== width) this.app.canvas.width = width;
    if (this.app.canvas.height !== height) this.app.canvas.height = height;
    for (const display of displays) {
      const rect = display.sharedRect;
      const scale = display.viewportWidth / rect.width;
      Object.assign(display.sharedVideo.style, {
        width: `${width * scale}px`, height: `${height * scale}px`,
        left: `${-rect.x * scale}px`, top: `${-rect.y * scale}px`
      });
    }
    const sourceWidth = this.app.outputWidth, sourceHeight = this.app.outputHeight;
    if (this.width !== sourceWidth || this.height !== sourceHeight) {
      this.width = sourceWidth; this.height = sourceHeight;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sourceWidth, sourceHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('共用背景畫布建立失敗');
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  begin() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.app.program);
  }

  present() {
    const gl = this.gl;
    if (gl.isContextLost() || !this.app.hasSharedBackground) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    for (const display of this.displays) {
      const theme = this.app.displayCanvas.ownerDocument.body.dataset.theme;
      const body = display.displayCanvas.ownerDocument.body;
      if (body.dataset.theme !== theme) body.dataset.theme = theme;
      const rect = display.sharedRect;
      if (!rect || !display.textTexture) continue;
      gl.viewport(rect.x, this.app.canvas.height - rect.y - rect.height, rect.width, rect.height);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, display.textTexture);
      gl.uniform2f(this.cropUniform, ...SharedRenderer.crop(this.width, this.height, rect.width, rect.height));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    this.track?.requestFrame?.();
  }

  capture(display) {
    const rect = display.sharedRect;
    const canvas = display.displayCanvas.ownerDocument.createElement('canvas');
    canvas.width = rect.width; canvas.height = rect.height;
    canvas.getContext('2d').drawImage(this.app.canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    return canvas;
  }

  dispose() {
    this.stream.getTracks().forEach(track => track.stop());
    const gl = this.gl;
    gl.deleteTexture(this.texture);
    gl.deleteFramebuffer(this.framebuffer);
    gl.deleteProgram(this.program);
  }
}
