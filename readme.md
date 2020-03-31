## Another World / Out of this World bytecode interpreter and CSS renderer.

I was reading [THE POLYGONS OF ANOTHER WORLD](http://fabiensanglard.net/another_world_polygons/index.html "THE POLYGONS OF ANOTHER WORLD") and somehow it made me wonder if a browser could keep up with rendering the intro's polygons as CSS. So I grabbed https://github.com/fabiensanglard/Another-World-Bytecode-Interpreter , converted a big chunk to JS, and made a CSS renderer. Somehow it mostly works!

I havent implemented the blending drawing modes. They require reading the frame buffer, but there isn't one. I could intersect the blended polygons with the existing polygons, and redraw every intersecting poly with a new color. But thats too much work for right now. Maybe someday.

I haven't implemented sound or music either, since I'm really only interested in doing terrible things with CSS.

The VM would probably go to the next part of the game at the end, but I've hardcoded it to loop.

#### Usage

Just load index.html in your favorite browser. It was only tested in Chrome, but I imagine others work ok. 

There is a janky checkbox in the lower left corner that will pause the VM when unchecked.