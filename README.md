# Pages

![Demo image](demo.png)

View HTML GitHub folder without GitHub pages.

## Todo

- feat: implement importing paths which include folders in fetchFile()
  - handle absolute paths
    - to current directory (in /about, references /about) - fetch would be redundant
    - to other directory (in /about, references /resources) - requires fetch
