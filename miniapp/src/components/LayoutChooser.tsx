import React, { useState } from 'react';
import './LayoutChooser.css';

const layouts = [
  {
    id: 'builder_base',
    name: 'Dark Builder Base Theme',
    image: '/coc_layout_builder_base_1782086855835.png'
  },
  {
    id: 'gold_pass',
    name: 'Royal Gold Pass Theme',
    image: '/coc_layout_gold_pass_1782086866545.png'
  },
  {
    id: 'magic_items',
    name: 'Mystic Magic Items Theme',
    image: '/coc_layout_magic_items_1782086878462.png'
  },
  {
    id: 'goblin_camp',
    name: 'Chaotic Goblin Map Theme',
    image: '/coc_layout_goblin_camp_1782086890573.png'
  },
  {
    id: 'townhall_jungle',
    name: 'Town Hall 14 Jungle Theme',
    image: '/coc_layout_townhall_jungle_1782086901254.png'
  }
];

export function LayoutChooser({ onChoose }: { onChoose: (id: string) => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % layouts.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + layouts.length) % layouts.length);
  };

  const currentLayout = layouts[currentIndex];

  return (
    <div className="layout-chooser-overlay">
      <div className="layout-chooser-header">
        <h2>Choose Your Theme</h2>
        <p>{currentIndex + 1} / {layouts.length}</p>
      </div>

      <div className="layout-chooser-image-container">
        <img 
          src={currentLayout.image} 
          alt={currentLayout.name} 
          className="layout-mockup-img" 
        />
      </div>

      <div className="layout-chooser-footer">
        <div className="layout-chooser-title">{currentLayout.name}</div>
        
        <div className="layout-chooser-controls">
          <button className="chooser-nav-btn" onClick={handlePrev}>{"<"}</button>
          
          <button 
            className="chooser-select-btn"
            onClick={() => onChoose(currentLayout.id)}
          >
            SELECT THIS LAYOUT
          </button>
          
          <button className="chooser-nav-btn" onClick={handleNext}>{">"}</button>
        </div>
      </div>
    </div>
  );
}
