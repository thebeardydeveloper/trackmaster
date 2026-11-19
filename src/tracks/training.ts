import type { TrackDef } from "../sim/track";
import type { Instruction } from "../sim/types";

export interface TrainingLevel {
  id: string;
  number: number;
  title: string;
  /** One line shown in the level list. */
  summary: string;
  /** What you need to do to pass. */
  objective: string;
  /** Short explanations shown in the guide panel. */
  lessons: string[];
  track: TrackDef;
  /** Crossing the finish line faster than this fails the level. */
  maxFinishKmh?: number;
  /** Nodes preloaded the first time the level is opened. */
  starter: Instruction[];
}

const baseScenery = (seed: number, trees = 160) => ({ seed, trees });

export const TRAINING_LEVELS: TrainingLevel[] = [
  {
    id: "recta",
    number: 1,
    title: "La recta",
    summary: "Acelerar, frenar y entender el tiempo de cada nodo.",
    objective: "Cruzá la meta (a 800 m) a 80 km/h o menos, en el menor tiempo posible.",
    lessons: [
      "Cada nodo es una orden que el auto ejecuta cuando el cronómetro llega a su tiempo (t).",
      "«Acelerar a X km/h» pisa a fondo hasta llegar a X y después mantiene esa velocidad.",
      "«Frenar a X km/h» frena lo más fuerte posible hasta X. A más velocidad, más metros necesita para frenar.",
      "Probá: acelerá a fondo y agregá un nodo de frenado. ¿En qué segundo tenés que frenar?",
    ],
    track: {
      id: "training-recta",
      name: "Recta de práctica",
      description: "",
      closed: false,
      segments: [{ type: "straight", length: 950 }],
      finishAt: 800,
      timeLimit: 60,
      scenery: baseScenery(101),
    },
    maxFinishKmh: 80,
    starter: [{ id: "s1", t: 0, action: { type: "accelerate", targetKmh: 150 } }],
  },
  {
    id: "una-curva",
    number: 2,
    title: "Una curva",
    summary: "Girar el volante: cuántos grados y durante cuánto tiempo.",
    objective: "Doblá a la derecha sin salirte de la pista y llegá a la meta.",
    lessons: [
      "«Girar» mueve las ruedas delanteras X grados durante Y segundos. Después vuelven al centro.",
      "El ángulo define el radio de la curva: más grados = curva más cerrada. La tabla de curvas te dice el ángulo justo para cada radio.",
      "La duración depende de la velocidad: a más velocidad, recorrés la curva en menos tiempo.",
      "Si llegás demasiado rápido, las gomas no agarran: el auto se abre (subviraje) o hace un trompo.",
    ],
    track: {
      id: "training-una-curva",
      name: "Curva de práctica",
      description: "",
      closed: false,
      segments: [
        { type: "straight", length: 300 },
        { type: "arc", radius: 40, angle: 90, dir: "right" },
        { type: "straight", length: 280 },
      ],
      gravelCorners: [0],
      timeLimit: 60,
      scenery: baseScenery(202),
    },
    starter: [
      { id: "s1", t: 0, action: { type: "accelerate", targetKmh: 100 } },
      { id: "s2", t: 12, action: { type: "steer", side: "right", degrees: 5, duration: 2 } },
    ],
  },
  {
    id: "curva-s",
    number: 3,
    title: "Curva en S",
    summary: "Encadenar giros y elegir la velocidad de entrada.",
    objective: "Pasá la chicane izquierda-derecha y llegá a la meta.",
    lessons: [
      "Una orden de giro nueva reemplaza a la anterior: podés pasar de izquierda a derecha sin volver al centro.",
      "Las ruedas no giran instantáneamente: tardan un instante en llegar al ángulo pedido.",
      "Frenar antes de la curva y acelerar al salir suele ser más rápido que entrar pasado.",
    ],
    track: {
      id: "training-curva-s",
      name: "Chicane de práctica",
      description: "",
      closed: false,
      segments: [
        { type: "straight", length: 250 },
        { type: "arc", radius: 45, angle: 60, dir: "left" },
        { type: "arc", radius: 45, angle: 60, dir: "right" },
        { type: "straight", length: 280 },
      ],
      timeLimit: 60,
      scenery: baseScenery(303),
    },
    starter: [],
  },
  {
    id: "horquilla",
    number: 4,
    title: "La horquilla",
    summary: "Límite de agarre, trompos y penalización por salirse.",
    objective: "Girá 180° en la horquilla sin terminar en la grava y llegá a la meta.",
    lessons: [
      "Una curva cerrada exige frenar fuerte: la velocidad máxima de cada curva está en la tabla.",
      "Salirse al pasto o a la grava no termina la carrera, pero el auto pierde mucho agarre y velocidad.",
      "Pedirle a las gomas mucho más de lo que pueden dar provoca un trompo: perdés varios segundos.",
      "Mirá la traza después de cada intento: los colores muestran la velocidad y las marcas, cada segundo.",
    ],
    track: {
      id: "training-horquilla",
      name: "Horquilla de práctica",
      description: "",
      closed: false,
      segments: [
        { type: "straight", length: 350 },
        { type: "arc", radius: 24, angle: 180, dir: "right" },
        { type: "straight", length: 320 },
      ],
      runoffWidth: 12,
      gravelCorners: [0],
      timeLimit: 60,
      scenery: baseScenery(404),
    },
    starter: [],
  },
];

export const getTrainingLevel = (id: string) => TRAINING_LEVELS.find((l) => l.id === id);
