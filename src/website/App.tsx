import React from 'react'
import Navbar               from './components/Navbar'
import Hero                 from './components/Hero'
import ProductPreview       from './components/ProductPreview'
import TrustStrip           from './components/TrustStrip'
import ManualAccountability from './components/ManualAccountability'
import FeatureStrip         from './components/FeatureStrip'
import AlternatingFeatures  from './components/AlternatingFeatures'
import DownloadSection      from './components/DownloadSection'
import FAQ                  from './components/FAQ'
import FinalCTA             from './components/FinalCTA'
import Footer               from './components/Footer'

// The scroll-progress listener that writes --nk-scroll / --nk-vignette lives
// at module scope in website-entry.tsx so the ambient background keeps
// working even if a child component crashes mid-render.

const WebsiteApp: React.FC = () => {
  return (
    <div className="nk-bg-page min-h-screen">
      <div aria-hidden className="nk-scroll-glow" />
      <div aria-hidden className="nk-scroll-vignette" />
      <div aria-hidden className="nk-scroll-grain" />
      <Navbar />
      <main>
        <Hero />
        <ProductPreview />
        <TrustStrip />
        <ManualAccountability />
        <FeatureStrip />
        <AlternatingFeatures />
        <DownloadSection />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}

export default WebsiteApp
