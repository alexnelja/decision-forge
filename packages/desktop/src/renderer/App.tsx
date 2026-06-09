import { Route, Routes, useLocation } from "react-router-dom";
import { Masthead } from "./components/Masthead";
import { Sidebar } from "./components/Sidebar";
import Home from "./pages/Home";
import MonteCarlo from "./pages/MonteCarlo";
import Negotiation from "./pages/Negotiation";
import Forecast from "./pages/Forecast";
import DependencyMap from "./pages/DependencyMap";

export default function App() {
  const location = useLocation();
  return (
    <div className="flex flex-col h-full">
      <Masthead />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        {/* key on pathname retriggers the entrance animations on navigation */}
        <main key={location.pathname} className="flex-1 min-w-0 flex">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/mc" element={<MonteCarlo />} />
            <Route path="/negotiation" element={<Negotiation />} />
            <Route path="/forecast" element={<Forecast />} />
            <Route path="/dependency-map" element={<DependencyMap />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
