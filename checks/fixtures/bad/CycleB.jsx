import React from "react";
import { helperA } from "./CycleA.jsx";
export function helperB() { return 2; }
export default function CycleB() { return <div>{helperA()}</div>; }
