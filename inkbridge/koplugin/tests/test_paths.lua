local Paths = require("lib/paths")

test("safeName strips what FAT32 refuses", function()
    assertEquals(Paths.safeName('Il nome/della: rosa?'), "Il nome_della_ rosa_")
    assertEquals(Paths.safeName("  spazi   doppi  "), "spazi doppi")
    assertEquals(Paths.safeName(""), "senza_titolo")
    assertEquals(Paths.safeName("punto finale..."), "punto finale")
end)

test("safeName keeps names short enough for the filesystem", function()
    local long = string.rep("a", 400)
    assertTrue(#Paths.safeName(long) <= 100, "nome troncato")
end)

test("bookTarget puts the author first", function()
    local item = {title = "Le città invisibili", authors = {"Italo Calvino"}}
    assertEquals(Paths.bookTarget("/books", item, "epub"),
                 "/books/Italo Calvino - Le città invisibili.epub")
end)

test("bookTarget copes with an author-less book", function()
    assertEquals(Paths.bookTarget("/books", {title = "Anonimo"}, "pdf"), "/books/Anonimo.pdf")
end)

test("chapterTarget sorts chapters by name", function()
    local target = Paths.chapterTarget("/books", {title = "Vinland Saga"},
                                       {index = 7, name = "Cap. 8"})
    assertEquals(target, "/books/Vinland Saga/0007 - Cap. 8.cbz")
end)

test("humanSize reads like a file manager", function()
    assertEquals(Paths.humanSize(512), "512 B")
    assertEquals(Paths.humanSize(2048), "2 kB")
    assertEquals(Paths.humanSize(5 * 1024 * 1024), "5.0 MB")
end)

test("size and exists go through lfs", function()
    Stubs.addFile("/books/x.epub", 4242)
    assertTrue(Paths.exists("/books/x.epub"), "file esistente")
    assertEquals(Paths.size("/books/x.epub"), 4242)
    assertTrue(not Paths.exists("/books/ghost.epub"), "file inesistente")
end)
