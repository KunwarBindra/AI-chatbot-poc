import React from 'react'

function Hero() {
    const quick = [
        "Save me time",
        "Tell me what you can do",
        "Help me plan",
        "Research a topic",
    ];
    return (
        <div className="hero">
            <h1>Hello, Wyatt!</h1>
            <p>How can Ahaan assist you today?</p>
            <div className="chips">
                {quick.map((q) => (
                    <button className="chip" key={q}>
                        {q}
                    </button>
                ))}
            </div>
        </div>
    );
}

export default Hero