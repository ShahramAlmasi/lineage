import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, Stars } from '@react-three/drei'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { CameraControls } from './CameraControls'
import type { CameraApi } from './CameraControls'
import LODOrganisms from './LODOrganisms'
import PostProcessing from './PostProcessing'
import type { Food, Organism } from '../simulation/types'

const WORLD_SIZE = 400
const WORLD_HALF_SIZE = WORLD_SIZE / 2
const WORLD_CORNERS: [number, number][] = [
  [-WORLD_HALF_SIZE, -WORLD_HALF_SIZE],
  [WORLD_HALF_SIZE, -WORLD_HALF_SIZE],
  [WORLD_HALF_SIZE, WORLD_HALF_SIZE],
  [-WORLD_HALF_SIZE, WORLD_HALF_SIZE],
]
const WORLD_EDGE_GEOMETRY = new THREE.BoxGeometry(WORLD_SIZE, 0, WORLD_SIZE)

const SceneLighting = memo(function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[100, 150, 50]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={500}
        shadow-camera-left={-250}
        shadow-camera-right={250}
        shadow-camera-top={250}
        shadow-camera-bottom={-250}
        shadow-bias={-0.0005}
      />
      <hemisphereLight
        args={['#87CEEB', '#2F4F2F', 0.6]}
        position={[0, 100, 0]}
      />
      <RimLight />
    </>
  )
})

const RimLight = memo(function RimLight() {
  const lightRef = useRef<THREE.PointLight>(null)

  useFrame(({ camera }) => {
    if (lightRef.current) {
      lightRef.current.position.set(
        camera.position.x + 20,
        camera.position.y + 10,
        camera.position.z + 20
      )
    }
  })

  return (
    <pointLight
      ref={lightRef}
      intensity={0.6}
      distance={300}
      color="#b8d4e8"
    />
  )
})

const GroundPlane = memo(function GroundPlane() {
  const groundMaterial = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')!

    const gradient = ctx.createLinearGradient(0, 0, 0, 512)
    gradient.addColorStop(0, '#1a2f1a')
    gradient.addColorStop(0.5, '#152515')
    gradient.addColorStop(1, '#1a2a1a')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 512, 512)

    for (let i = 0; i < 6000; i++) {
      const x = Math.random() * 512
      const y = Math.random() * 512
      const size = Math.random() * 1.5 + 0.5
      const alpha = Math.random() * 0.06 + 0.02
      ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '60, 90, 60' : '40, 70, 40'}, ${alpha})`
      ctx.beginPath()
      ctx.arc(x, y, size, 0, Math.PI * 2)
      ctx.fill()
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(8, 8)
    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.92,
      metalness: 0.05,
      color: '#1a2a1a',
    })
  }, [])

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.1, 0]}
        receiveShadow
      >
        <planeGeometry args={[1000, 1000]} />
        <primitive object={groundMaterial} attach="material" />
      </mesh>
      <Grid
        position={[0, 0.01, 0]}
        args={[1000, 1000]}
        cellSize={20}
        cellThickness={0.3}
        cellColor="#3a4a3a"
        sectionSize={100}
        sectionThickness={0.6}
        sectionColor="#4a5a4a"
        fadeDistance={300}
        fadeStrength={2}
        infiniteGrid
      />
    </group>
  )
})

const WorldBounds = memo(function WorldBounds() {
  return (
    <group>
      {WORLD_CORNERS.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.5, z]}>
          <boxGeometry args={[2, 1, 2]} />
          <meshStandardMaterial
            color="#4a6a4a"
            emissive="#2a4a2a"
            emissiveIntensity={0.3}
            transparent
            opacity={0.6}
          />
        </mesh>
      ))}
      <lineSegments>
        <edgesGeometry
          args={[WORLD_EDGE_GEOMETRY]}
        />
        <lineBasicMaterial color="#3a5a3a" transparent opacity={0.3} />
      </lineSegments>
    </group>
  )
})

function EnvironmentEffects() {
  const { scene } = useThree()

  useEffect(() => {
    scene.fog = new THREE.Fog('#0d1a0d', 200, 500)
    scene.background = new THREE.Color('#0d1a0d')

    return () => {
      scene.fog = null
      scene.background = null
    }
  }, [scene])

  return null
}

function SceneSetup() {
  const { camera } = useThree()

  useEffect(() => {
    camera.lookAt(0, 0, 0)
  }, [camera])

  return null
}

interface World3DProps {
  organisms: Organism[]
  food: Food[]
  worldWidth: number
  worldHeight: number
  isRunning: boolean
  selectedOrganismId: number | null
  onSelectOrganism: (id: number | null) => void
  onCameraApiReady?: (api: CameraApi) => void
}

const FoodDots = memo(function FoodDots({ food, worldWidth, worldHeight }: { food: Food[]; worldWidth: number; worldHeight: number }) {
  const visibleFood = useMemo(() => food.slice(-1000), [food])
  const halfWidth = worldWidth / 2
  const halfHeight = worldHeight / 2
  return (
    <group>
      {visibleFood.map((item, index) => (
        <mesh key={`${item.position.x}-${item.position.y}-${index}`} position={[item.position.x - halfWidth, 0.25, item.position.y - halfHeight]}>
          <sphereGeometry args={[0.35, 8, 6]} />
          <meshBasicMaterial color="#8fd14f" transparent opacity={0.85} />
        </mesh>
      ))}
    </group>
  )
})

function World3D({ organisms, food, worldWidth, worldHeight, isRunning, selectedOrganismId, onSelectOrganism, onCameraApiReady }: World3DProps) {
  const [canvasSize, setCanvasSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  })

  useEffect(() => {
    const handleResize = () => {
      setCanvasSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'fixed',
        top: 0,
        left: 0,
        overflow: 'hidden',
      }}
    >
      <Canvas
        camera={{
          position: [0, 100, 200],
          fov: 60,
          near: 0.1,
          far: 1000,
        }}
        shadows
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
        }}
        frameloop={isRunning ? 'always' : 'demand'}
        style={{
          width: canvasSize.width,
          height: canvasSize.height,
        }}
        onCreated={({ gl }) => {
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))
          gl.shadowMap.enabled = true
          gl.shadowMap.type = THREE.PCFSoftShadowMap
        }}
      >
        <SceneSetup />
        <CameraControls
          organisms={organisms}
          selectedOrganismId={selectedOrganismId}
          onSelectOrganism={onSelectOrganism}
          onApiReady={onCameraApiReady}
        />
        <EnvironmentEffects />
        <SceneLighting />
        <GroundPlane />
        <WorldBounds />
        <Stars
          radius={300}
          depth={50}
          count={1000}
          factor={4}
          saturation={0}
          fade
          speed={0.5}
        />
        <LODOrganisms
          organisms={organisms}
          worldWidth={worldWidth}
          worldHeight={worldHeight}
          isRunning={isRunning}
        />
        <FoodDots food={food} worldWidth={worldWidth} worldHeight={worldHeight} />
        <PostProcessing />
      </Canvas>
    </div>
  )
}

export default memo(World3D)
