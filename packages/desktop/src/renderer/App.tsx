import { Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import Home from "./pages/Home";
import MonteCarlo from "./pages/MonteCarlo";
import Negotiation from "./pages/Negotiation";
import Forecast from "./pages/Forecast";

export default function App() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/mc" element={<MonteCarlo />} />
        <Route path="/negotiation" element={<Negotiation />} />
        <Route path="/forecast" element={<Forecast />} />
      </Routes>
    </div>
  );
}
