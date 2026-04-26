import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { memo } from 'react'

function PostProcessing() {
  return (
    <EffectComposer>
      <Bloom
        intensity={0.5}
        luminanceThreshold={0.7}
        luminanceSmoothing={0.9}
        mipmapBlur
      />
    </EffectComposer>
  )
}

export default memo(PostProcessing)
