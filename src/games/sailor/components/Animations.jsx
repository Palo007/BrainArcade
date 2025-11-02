import React from 'react';
import fish1Img from '../assets/fish1.png';
import fish2Img from '../assets/fish2.png';

export function Animations() {
  return (
    <>
      {/* Birds - 3 instances flying at different positions */}
      <div
        className="bird-wrapper absolute"
        style={{
          left: '20%',
          top: '15%',
          animationDelay: '0.4s',
        }}
      >
        <Bird />
      </div>

      <div
        className="bird-wrapper absolute"
        style={{
          left: '50%',
          top: '10%',
          animationDelay: '0s',
        }}
      >
        <Bird />
      </div>

      <div
        className="bird-wrapper absolute"
        style={{
          left: '75%',
          top: '20%',
          animationDelay: '1s',
        }}
      >
        <Bird />
      </div>

      {/* Clouds - 3 instances made of 3 white circles each */}
      <div
        className="cloud absolute"
        style={{
          left: '15%',
          top: '25%',
          animationDelay: '0s',
        }}
      >
        <Cloud size="medium" />
      </div>

      <div
        className="cloud absolute"
        style={{
          left: '45%',
          top: '30%',
          animationDelay: '0.4s',
        }}
      >
        <Cloud size="large" />
      </div>

      <div
        className="cloud absolute"
        style={{
          left: '70%',
          top: '18%',
          animationDelay: '0.6s',
        }}
      >
        <Cloud size="small" />
      </div>

      {/* Fish - 2 instances swimming at different positions */}
      <div
        className="fish-wrapper"
        style={{
          left: '10%',
          top: '70%',
        }}
      >
        <div className="fish-swim" style={{ animationDelay: '0s' }}>
          <img
            src={fish1Img}
            alt="Fish"
            style={{
              width: '60px',
              height: 'auto',
              imageRendering: 'pixelated',
            }}
          />
        </div>
      </div>

      <div
        className="fish-wrapper"
        style={{
          left: '80%',
          top: '75%',
        }}
      >
        <div className="fish-swim" style={{ animationDelay: '1s' }}>
          <img
            src={fish2Img}
            alt="Fish"
            style={{
              width: '70px',
              height: 'auto',
              imageRendering: 'pixelated',
            }}
          />
        </div>
      </div>
    </>
  );
}

// Bird component with wings
function Bird() {
  return (
    <div className="relative" style={{ width: '28px', height: '14px' }}>
      <div className="left-wing">
        <span></span>
      </div>
      <div className="right-wing">
        <span></span>
      </div>
    </div>
  );
}

// Cloud component made of 3 white circles
function Cloud({ size = 'medium' }) {
  const sizes = {
    small: { main: 20, left: 14, right: 16 },
    medium: { main: 28, left: 20, right: 24 },
    large: { main: 36, left: 26, right: 30 },
  };

  const { main, left, right } = sizes[size];

  return (
    <div className="relative" style={{ width: `${main + 20}px`, height: `${main}px` }}>
      {/* Left circle */}
      <div
        className="cloud-circle"
        style={{
          width: `${left}px`,
          height: `${left}px`,
          left: '0px',
          top: `${(main - left) / 2}px`,
        }}
      />

      {/* Center (main) circle */}
      <div
        className="cloud-circle"
        style={{
          width: `${main}px`,
          height: `${main}px`,
          left: `${left / 2}px`,
          top: '0px',
        }}
      />

      {/* Right circle */}
      <div
        className="cloud-circle"
        style={{
          width: `${right}px`,
          height: `${right}px`,
          left: `${left / 2 + main - right / 2}px`,
          top: `${(main - right) / 2}px`,
        }}
      />
    </div>
  );
}
