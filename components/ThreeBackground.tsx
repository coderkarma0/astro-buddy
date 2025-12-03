import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars, Sparkles, MeshDistortMaterial, Float, Text, Cloud } from '@react-three/drei';
import * as THREE from 'three';

interface ThreeBackgroundProps {
  active: boolean;
  modeColor: string;
  isTalking: boolean;
  isAnalyzing: boolean;
}

const zodiacSigns = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];

const ZodiacRing = ({ isAnalyzing }: { isAnalyzing: boolean }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state, delta) => {
    if (groupRef.current) {
        groupRef.current.rotation.z -= delta * (isAnalyzing ? 0.5 : 0.05);
    }
  });

  return (
    <group ref={groupRef} rotation={[Math.PI / 3, 0, 0]}>
      {zodiacSigns.map((sign, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const radius = 4.5;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        
        return (
          <Text
            key={i}
            position={[x, y, 0]}
            rotation={[0, 0, angle - Math.PI / 2]}
            fontSize={0.5}
            color={isAnalyzing ? "#ffd700" : "rgba(255,255,255,0.2)"} // Dimmed non-active color
            anchorX="center"
            anchorY="middle"
          >
            {sign}
          </Text>
        );
      })}
      <mesh>
          <torusGeometry args={[4.5, 0.02, 16, 100]} />
          <meshBasicMaterial color={isAnalyzing ? "#ffd700" : "#4f46e5"} opacity={0.2} transparent />
      </mesh>
    </group>
  );
};

const Planet = ({ radius, speed, color, size, offset }: { radius: number, speed: number, color: string, size: number, offset: number }) => {
    const ref = useRef<THREE.Mesh>(null);
    useFrame((state) => {
        if (ref.current) {
            const time = state.clock.getElapsedTime();
            ref.current.position.x = Math.cos(time * speed + offset) * radius;
            ref.current.position.z = Math.sin(time * speed + offset) * radius;
        }
    });

    return (
        <mesh ref={ref}>
            <sphereGeometry args={[size, 32, 32]} />
            <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
    );
};

const AnimatedOrb = ({ active, color, isTalking, isAnalyzing }: { active: boolean; color: string; isTalking: boolean; isAnalyzing: boolean }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<any>(null);
  
  const targetColor = useMemo(() => new THREE.Color(isAnalyzing ? "#ffd700" : color), [isAnalyzing, color]);

  useFrame((state, delta) => {
    if (meshRef.current) {
      const targetRotationSpeed = isAnalyzing ? 3.0 : 0.2;
      meshRef.current.rotation.x += 0.005 * targetRotationSpeed;
      meshRef.current.rotation.y += 0.01 * targetRotationSpeed;
      
      let targetScale = 2;
      if (isAnalyzing) {
        targetScale = 2.5 + Math.sin(state.clock.getElapsedTime() * 20) * 0.1; 
      } else if (isTalking) {
        targetScale = 2.2 + Math.sin(state.clock.getElapsedTime() * 10) * 0.2;
      } else {
        targetScale = 2 + Math.sin(state.clock.getElapsedTime() * 2) * 0.1;
      }
      
      const lerpFactor = isAnalyzing ? 0.2 : 0.1;
      meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), lerpFactor);
    }

    if (materialRef.current) {
      materialRef.current.color.lerp(targetColor, delta * 2.5);
      const targetDistort = isAnalyzing ? 1.2 : (active ? 0.5 : 0.3);
      materialRef.current.distort = THREE.MathUtils.lerp(materialRef.current.distort, targetDistort, delta * 2);
      const targetSpeed = isAnalyzing ? 10 : (active ? 3 : 1.5);
      materialRef.current.speed = THREE.MathUtils.lerp(materialRef.current.speed, targetSpeed, delta * 2);
    }
  });

  return (
    <Float speed={isAnalyzing ? 5 : 2} rotationIntensity={0.5} floatIntensity={0.5}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 128, 128]} />
        <MeshDistortMaterial
          ref={materialRef}
          color={color}
          envMapIntensity={0.5}
          clearcoat={0.8}
          clearcoatRoughness={0.2}
          metalness={0.2}
          roughness={0.4}
        />
      </mesh>
    </Float>
  );
};

export const ThreeBackground: React.FC<ThreeBackgroundProps> = ({ active, modeColor, isTalking, isAnalyzing }) => {
  return (
    <div className="absolute inset-0 z-0 transition-colors duration-1000 bg-black">
      <Canvas camera={{ position: [0, 0, 8], fov: 45 }}>
        <fog attach="fog" args={['#000000', 5, 20]} />
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={0.8} color={isAnalyzing ? "#ffd700" : modeColor} />
        <pointLight position={[-10, -10, -10]} intensity={0.3} color="#4f46e5" />
        
        <Stars 
          radius={100} 
          depth={50} 
          count={3000} 
          factor={4} 
          saturation={0} 
          fade 
          speed={isAnalyzing ? 3 : 0.5} 
        />
        
        <Sparkles 
          count={isAnalyzing ? 500 : 200} 
          scale={12} 
          size={isAnalyzing ? 3 : 1.5} 
          speed={isAnalyzing ? 1 : 0.2} 
          opacity={0.4} 
          color={isAnalyzing ? "#ffffff" : modeColor} 
        />
        
        <Cloud opacity={0.3} speed={0.2} width={10} depth={1.5} segments={20} position={[0, -5, -10]} color="#1e1b4b" />

        <group rotation={[0.2, 0, 0]}>
            <ZodiacRing isAnalyzing={isAnalyzing} />
            <Planet radius={6} speed={0.1} offset={0} size={0.3} color="#fcd34d" />
            <Planet radius={7.5} speed={0.08} offset={2} size={0.4} color="#818cf8" />
            <Planet radius={9} speed={0.05} offset={4} size={0.2} color="#f472b6" />
        </group>

        <AnimatedOrb 
          active={active} 
          color={modeColor} 
          isTalking={isTalking} 
          isAnalyzing={isAnalyzing}
        />
      </Canvas>
    </div>
  );
};
