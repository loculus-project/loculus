package org.loculus.backend.testutil.binary

import org.loculus.backend.testutil.MinioProvider
import org.loculus.backend.testutil.waitForPort
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths

class LocalMinio : MinioProvider {
    private val binary: Path = Paths.get("/tmp/minio")
    private val dataDir: Path = Paths.get(System.getProperty("java.io.tmpdir"), "minio-data")
    private val port: Int = 9000
    private val consolePort: Int = 9001
    private var process: Process? = null

    override val accessKey = "minioadmin"
    override val secretKey = "minioadmin"
    override val s3Url: String
        get() = "http://localhost:$port"

    override fun start() {
        Files.createDirectories(dataDir)
        ProcessBuilder("chown", "-R", "nobody:nogroup", dataDir.toString())
            .redirectOutput(ProcessBuilder.Redirect.DISCARD)
            .redirectError(ProcessBuilder.Redirect.DISCARD)
            .start().waitFor()
        ProcessBuilder("chmod", "+x", binary.toString())
            .redirectOutput(ProcessBuilder.Redirect.DISCARD)
            .redirectError(ProcessBuilder.Redirect.DISCARD)
            .start().waitFor()
        ProcessBuilder("chown", "nobody:nogroup", binary.toString())
            .redirectOutput(ProcessBuilder.Redirect.DISCARD)
            .redirectError(ProcessBuilder.Redirect.DISCARD)
            .start().waitFor()
        val pb = ProcessBuilder(
            "runuser",
            "-u",
            "nobody",
            "--",
            binary.toString(),
            "server",
            "--address",
            ":$port",
            "--console-address",
            ":$consolePort",
            dataDir.toString(),
        )
        pb.environment()["MINIO_ROOT_USER"] = accessKey
        pb.environment()["MINIO_ROOT_PASSWORD"] = secretKey
        pb.redirectOutput(ProcessBuilder.Redirect.DISCARD)
        pb.redirectError(ProcessBuilder.Redirect.DISCARD)
        process = pb.start()
        waitForPort(port)
    }

    override fun stop() {
        process?.destroy()
        process?.waitFor()
    }
}
