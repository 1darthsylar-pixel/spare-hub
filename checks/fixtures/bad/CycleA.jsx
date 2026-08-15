import React from "react";
import { helperB } from "./CycleB.jsx";
export function helperA() { return 1; }
export default function CycleA() { return <div>{helperB()}</div>; }
