import Link from "next/link";
import { AnimatedText } from "@/components/animated-text";
import { RockCanvasDynamic } from "@/components/rock-canvas-dynamic";
import { ArrowRight } from "lucide-react";
import { LoginButton } from "@/components/login-button";
import { NewsletterSignup } from "@/components/newsletter-signup";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-white text-black font-sans selection:bg-black selection:text-white">
      
      {/* Navbar */}
      <nav className="w-full flex justify-between items-center z-50 p-6 md:px-12 fixed top-0 bg-white/50 backdrop-blur-md border-b border-black/5">
        <div className="text-xl font-bold tracking-tighter">Bank Rock</div>
        <div className="flex gap-8 items-center">
          <Link href="/shop" className="text-sm font-medium hover:opacity-50 transition-opacity">
            Shop
          </Link>
          <Link href="/mcp" className="text-sm font-medium hover:opacity-50 transition-opacity">
            AI Oracle
          </Link>
          <LoginButton />
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative w-full h-[100vh] flex flex-col items-center justify-center pt-20 overflow-hidden">
        
        {/* 3D Canvas Background */}
        <div className="absolute inset-0 z-0 opacity-80 mix-blend-multiply pointer-events-auto">
          <RockCanvasDynamic />
        </div>

        <div className="z-10 flex flex-col items-center justify-center text-center w-full max-w-5xl mx-auto px-6 pointer-events-none">
          <AnimatedText 
            text="Tangible DeFi." 
            className="text-7xl md:text-[9rem] leading-none font-black tracking-tighter mb-8"
          />
          
          <p className="text-xl md:text-2xl text-neutral-500 font-medium max-w-2xl mx-auto mb-12 opacity-0 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-500 fill-mode-forwards tracking-tight">
            A physical interface to your self-custodial liquidity. Tap your Bank Rock to access agentic strategies and automated yield generation.
          </p>

          <div className="flex items-center gap-6 opacity-0 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-700 fill-mode-forwards pointer-events-auto">
            <Link href="/shop" className="group flex items-center gap-3 bg-black text-white px-10 py-5 rounded-full font-semibold text-lg hover:bg-black/90 transition-all hover:scale-105 active:scale-95 shadow-xl shadow-black/10">
              Get your Rock
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* The Story Section */}
      <section className="w-full bg-neutral-50 py-32 md:py-48 px-6 md:px-12 relative z-10">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24 items-center">
          
          <div className="flex flex-col gap-6">
            <span className="text-sm font-bold uppercase tracking-widest text-neutral-400">The Origin</span>
            <h2 className="text-5xl md:text-7xl font-bold tracking-tighter leading-tight">
              Forged in Florence.
            </h2>
            <p className="text-xl text-neutral-600 leading-relaxed font-medium mt-4">
              During the 15th century, the Medici family revolutionized global finance in Florence, inventing double-entry bookkeeping and the letter of credit. They laid the foundation for modern banking.
            </p>
            <p className="text-xl text-neutral-600 leading-relaxed font-medium">
              Every Bank Rock is handpicked from the riverbeds near Florence, bridging the birthplace of classical finance with the frontier of agentic, self-custodial DeFi.
            </p>
          </div>

          <div className="relative aspect-square bg-white rounded-3xl p-12 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] border border-neutral-100 overflow-hidden group">
            {/* Super white clean background */}
            <div className="absolute inset-0 bg-white z-0" />
            
            {/* Map Silhouette */}
            <svg 
              viewBox="0 0 200 200" 
              className="w-[120%] h-[120%] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-neutral-50 z-10" 
              fill="currentColor"
            >
              <path d="M17.424,63.269L17.368,52.384L42.244,48.85L41.507,31.086L59.957,8.098L59.861,18.141L69.117,28.478L63.499,40.335L72.821,58.011L63.415,59.507L62.488,67.032L66.855,75.326L74.265,73.405L84.572,94.513L53.668,97.693L45.688,117.023L22.043,115.255L9.349,105.272L8.318,97.517L15.451,90.332L0.891,71.404ZM68.315,75.346L68.382,75.558L68.359,75.027ZM36.849,33.409L41.052,33.745L42.244,48.85L14.563,54.374L6.681,41.291L14.077,33.512ZM30.913,126.421L36.634,115.906L47.775,115.019L52.792,98.3L71.029,99.487L75.685,90.974L93.848,96.317L92.148,102.705L112.661,117.486L104.945,119.443L69.604,102.322L47.773,126.591L34.846,131.736ZM52.827,120.451L52.912,120.51L52.76,120.544ZM59.9,111.097L59.881,111.023L59.941,111.055ZM75.67,103.9L73.924,103.381L75.178,103.696ZM73.751,103.422L74.037,103.556L71.978,102.934ZM71.444,102.8L70.447,102.83L71.77,102.539ZM91.962,110.259L91.959,110.277L91.945,110.276ZM103.27,118.438L103.278,118.45L103.255,118.456ZM103.036,118.152L103.036,118.167L103.024,118.162ZM105.552,120.586L105.52,120.598L105.547,120.549ZM105.454,120.348L105.629,120.491L105.473,120.492ZM105.621,119.435L105.421,120.121L104.96,119.535ZM105.777,119.339L105.774,119.312L105.793,119.327ZM64.277,41.418L69.569,24.131L79.016,38.119L87.085,6.534L92.878,6.026L95.75,15.679L108.848,12.058L114.4,19.347L111.792,4.592L118.176,0L130.558,8.829L125.078,30.363L127.674,39.732L137.643,37.646L130.773,48.37L132.669,60.376L156.681,78.441L127.248,80.153L95.727,70.055L84.421,90.505L74.265,73.405L66.855,75.326L62.488,67.032L63.415,59.507L72.821,58.011ZM87.322,89.829L87.713,89.744L87.424,89.616ZM87.63,90.229L87.79,90.172L87.793,90.042ZM77.07,30.613L77.144,31.596L76.553,31.491ZM68.359,75.027L68.382,75.558L68.315,75.346ZM88.714,88.284L87.171,79.281L95.727,70.055L128.779,80.352L184.25,78.752L188.208,85.645L183.109,89.355L186.88,109.421L199.109,127.503L191.311,127.078L191.742,122.042L184.497,132.242L174.849,132.376L165.88,127.18L167.139,116.056L156.497,110.84L150.769,117.267L129.625,116.444L109.406,100.611L92.148,102.705L93.848,96.317L84.425,93.748ZM181.016,130.191L181.38,131.845L183.061,131.271ZM87.63,90.229L87.793,90.042L87.79,90.172ZM87.322,89.829L87.424,89.616L87.713,89.744ZM125.977,113.094L125.975,113.062L126.013,113.051ZM107.061,114.265L100.207,105.094L104.591,100.513L139.739,118.801L156.497,110.84L167.268,116.212L166.589,127.813L187.338,134.753L176.105,147.896L182.553,153.243L172.852,159.769L173.957,172.138L167.282,175.163L169.097,181.759L161.614,185.54L162.879,191.314L147.794,194.604L148.64,186.819L134.096,175.178L135.484,170.445L126.524,169.421L127.447,155.74L118.118,127.416ZM125.977,113.094L126.013,113.051L125.975,113.062ZM113.841,184.777L113.847,184.84L113.794,184.809ZM112.961,183.241L113.619,185.21L111.985,185.186ZM112.981,183.126L112.953,183.134L112.966,183.107ZM118.988,177.705L113.724,175.986L124.728,173.131L124.382,179.129ZM123.783,179.258L123.771,179.252L123.779,179.235ZM122.095,179.099L122.089,179.1L122.103,179.087ZM122.093,179.085L122.08,179.08L122.097,179.062ZM123.557,179.096L123.556,179.084L123.568,179.082ZM122.491,178.968L122.486,178.968L122.49,178.955ZM122.493,178.891L122.499,178.948L122.456,178.953ZM122.519,178.838L122.557,178.894L122.482,178.847ZM120.761,178.158L120.728,178.173L120.739,178.139ZM103.807,164.999L103.755,164.974L103.779,164.961ZM104.719,163.173L105.409,164.369L104.264,166.266ZM107.188,146.834L107.316,147.508L106.795,147.562ZM117.487,142.061L117.471,142.046L117.486,142.044ZM117.495,141.978L117.481,141.981L117.482,141.955ZM117.885,175.745L117.875,175.724L117.892,175.73ZM126.382,169.412L126.362,169.403L126.415,169.374ZM120.549,195.052L121.082,196.323L119.918,196.533ZM112.467,194.718L112.472,194.734L112.449,194.732ZM121.123,174.01L121.086,174.014L121.12,173.977ZM124.46,175.724L124.434,175.696L124.471,175.661ZM128.214,172.582L128.116,172.786L128.091,172.702ZM125.844,172.312L125.735,172.438L125.709,172.349ZM125.812,172.227L125.809,172.262L125.787,172.239ZM124.142,172.132L124.088,172.122L124.131,172.101ZM182.565,130.221L181.757,131.997L180.796,130.457ZM152.94,193.789L152.912,193.764L152.94,193.736ZM133.505,175.365L133.494,175.424L133.468,175.337ZM139.604,186.024L139.597,186.018L139.611,186.017ZM139.438,185.723L139.415,185.719L139.405,185.663ZM139.064,185.155L138.981,185.162L138.944,185.09ZM146.397,198.896L146.381,200L145.841,199.384ZM139.022,195.104L139.023,195.132L139.008,195.105ZM140.537,194.83L140.532,194.852L140.507,194.828ZM139.161,193.366L140.263,196.495L138.507,194.905ZM147.089,193.863L147.064,193.923L147.039,193.877ZM149.657,193.666L149.756,193.785L149.627,193.735ZM145.488,192.108L145.435,192.1L145.516,192.068Z" />
            </svg>

            {/* Florence flashing dot */}
            {/* The projection of 200x200 put Florence at X=151.13, Y=132.03. 
                Because we scaled the svg to 120% and centered it, we need to map those coordinates to the div.
                Actually, we can place the dot INSIDE the SVG for perfect alignment! */}
            <svg viewBox="0 0 200 200" className="w-[120%] h-[120%] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 overflow-visible pointer-events-none">
              <g transform="translate(151.13, 132.03)">
                <circle cx="0" cy="0" r="4" className="fill-blue-500 animate-ping opacity-75" />
                <circle cx="0" cy="0" r="1.5" className="fill-blue-600" />
              </g>
            </svg>

            <div className="absolute bottom-6 left-6 text-[10px] font-bold tracking-widest text-neutral-400 uppercase z-30 flex flex-col gap-1">
              <span>Tuscany, IT</span>
              <span className="font-mono text-neutral-300">43.7696° N, 11.2558° E</span>
            </div>
          </div>

        </div>
      </section>

      {/* Newsletter Signup */}
      <NewsletterSignup />

      {/* Footer */}
      <footer className="w-full bg-black text-white py-24 px-6 md:px-12 z-10 relative">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-12">
          <div className="text-4xl font-black tracking-tighter">Bank Rock</div>
          <div className="flex gap-8 text-neutral-400 font-medium">
            <Link href="/mcp" className="hover:text-white transition-colors">AI Oracle</Link>
            <Link href="/shop" className="hover:text-white transition-colors">Shop</Link>
            <Link href="#" className="hover:text-white transition-colors">Twitter</Link>
            <Link href="https://github.com/lucaguglielmi/bankrock-ethglobal" className="hover:text-white transition-colors">GitHub</Link>
          </div>
        </div>
      </footer>

    </main>
  );
}
