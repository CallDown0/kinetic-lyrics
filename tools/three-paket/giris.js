// Kinetik Klip duvar kâğıdı için kütüphaneler, klasik betik olarak açılır (WE dosyadan açtığı için ES modülü yüklenemeyebilir):
// window.THREE = three.js, window.PP = postprocessing (şok dalgası, gren, kenar kararması, renk kayması),
// window.TT = troika-three-text (GPU'da keskin 3D yazı; 3D sözler).
// Yeniden üretmek için: npm run paket  (sonra three.bundle.js'i duvar kâğıdı klasörüne kopyala)
import * as THREE from 'three';
import { EffectComposer, RenderPass, ClearPass, EffectPass, Effect, EffectAttribute, BlendFunction,
  ChromaticAberrationEffect, ShockWaveEffect, NoiseEffect, VignetteEffect } from 'postprocessing';
import { Text, preloadFont, configureTextBuilder } from 'troika-three-text';
window.THREE = THREE;
window.PP = { EffectComposer, RenderPass, ClearPass, EffectPass, Effect, EffectAttribute, BlendFunction,
  ChromaticAberrationEffect, ShockWaveEffect, NoiseEffect, VignetteEffect };
window.TT = { Text, preloadFont, configureTextBuilder };
