import io.mockk.mockk
import org.pathoplexus.backend.controller.PublicJwtKeyConfig
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.test.context.ActiveProfiles
import javax.sql.DataSource

@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
@SpringBootTest
@ActiveProfiles("test")
@Import(
    TestConfig::class,
    PublicJwtKeyConfig::class,
)
annotation class SpringBootTestWithoutDatabase

@TestConfiguration
class TestConfig {
    @Bean
    @Primary
    fun dataSource(): DataSource {
        return mockk()
    }
}
