---
layout: ../../layouts/BlogLayout.astro
title: Being told to solve MNIST by the Fast.ai Book
description: Get your tensors in line.
tags: ["machine learning", "computer vision", "fastai", ""]
time: "2"
featured: true
timestamp: 2025-07-02T12:05:00-04:00
filename: fastbook-mnist
---

As part of the Research section on [Chapter 4 of the book](https://github.com/fastai/fastbook/blob/master/04_mnist_basics.ipynb), you're asked to 1) implement your own Learner class, based on what you see in the book and 2) train on the full MNIST dataset, not just 3s and 7s.

I thought it was mostly straightforward, I'll keep using Torch's backward because I don't want to calculate gradients by hand (at least not today).

One of the traps that I fell into was switching from distance between 3s and 7s (effectively predicting floats between 0 and 1), to actually predicting numbers.

But how do you create smooth curves for your loss function for predicting numbers from 0 to 9?

Using the loss function of distance between 3 and 7 wasn't working - that makes the algorithm think some weird stuff:
- 0
- 1 <- this is closer to 0?  
...
- 8 < this is closer to 9?
- 9

Which doesn't make sense when looking at images of hand-drawn digits. You can't also predict an 8.5 as being closer to an image of a 9.  
Predicting numbers between 0 and 9 looking at images, is the estimation of the probability of different possible discrete outcomes:  
(Looking at an image of a 0):
- 0 Clearly, this number!
- 1 Definitely, not this one!
- 2 Nor this one!  
...

This is when some searching on known MNIST architecture will make you aware of cross entropy loss.  
What would an ideal set of discrete probabilities look for predicting an image of a 0?  
Label: 0  
One-hot encoding -> [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]  
Having any other number be 1, or the index representing the class (0) being farther from 1, would make our loss go up.

I also forgot to scale values (pixel brightness ranges from 0 to 255), which in using [0,1] we provide numerical stability and fast/stable convergence.  
My loss wasn't even going down before this.  

After a bit of brain wrangling, I was able to get an okay-ish result: [0.94850 on the Kaggle Digit Recognizer competition!](https://www.kaggle.com/code/dewstend/mnist-digit-recognizer/notebook)

I learned a bunch, but now it's time to rest a bit from the Tensor Inferno.