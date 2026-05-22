'use strict';

const calculus = require('./topics/calculus');
const multivariableCalculus = require('./topics/multivariableCalculus');
const complexNumbers = require('./topics/complexNumbers');
const complexAnalysis = require('./topics/complexAnalysis');
const matrices = require('./topics/matrices');
const differentialEquations = require('./topics/differentialEquations');
const laplace = require('./topics/laplace');
const series = require('./topics/series');
const vectorCalculus = require('./topics/vectorCalculus');
const realAnalysis = require('./topics/realAnalysis');
const numericalMethods = require('./topics/numericalMethods');
const physics = require('./topics/physics');

// Order matters — most specific first
const TOPICS = [
  { name: 'Complex Analysis',          module: complexAnalysis },
  { name: 'Real Analysis',             module: realAnalysis },
  { name: 'Numerical Methods',         module: numericalMethods },
  { name: 'Laplace Transforms',        module: laplace },
  { name: 'Differential Equations',    module: differentialEquations },
  { name: 'Multivariable Calculus',    module: multivariableCalculus },
  { name: 'Vector Calculus',           module: vectorCalculus },
  { name: 'Series & Sequences',        module: series },
  { name: 'Complex Numbers',           module: complexNumbers },
  { name: 'Matrices & Linear Algebra', module: matrices },
  { name: 'Physics, Quantum Mechanics & Hypothetical Physics', module: physics },
  { name: 'Calculus',                  module: calculus },
];

function detectTopic(question) {
  for (const topic of TOPICS) {
    if (topic.module.detect(question)) {
      console.log(`📚 Topic: ${topic.name}`);
      return { name: topic.name, prompt: topic.module.prompt };
    }
  }
  console.log('📚 Topic: General math');
  return null;
}

function getPromptForQuestion(question, defaultPrompt) {
  const topic = detectTopic(question);
  return topic ? topic.prompt : defaultPrompt;
}

module.exports = { detectTopic, getPromptForQuestion };